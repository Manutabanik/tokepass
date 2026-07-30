-- =============================================================================
-- P3: money integrity (finalize paid), organizer approval RLS, finance math
-- Idempotent: safe to re-run CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B1 repair: featured guard RAISE (no duplicated MESSAGE keyword)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_featured_columns_service_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (
       new.is_featured is distinct from old.is_featured
       or new.featured_tier is distinct from old.featured_tier
       or new.featured_until is distinct from old.featured_until
     )
     and coalesce(auth.role(), '') <> 'service_role'
  then
    raise exception
      'Solo el webhook/service_role puede modificar Boost/featured'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- C1: approved organizer helper (role admin = organizer in this schema)
-- -----------------------------------------------------------------------------
create or replace function public.is_approved_organizer(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = p_user_id
      and (
        p.role::text = 'super_admin'
        or (
          p.role::text = 'admin'
          and p.organizer_approval_status =
            'approved'::public.organizer_approval_status
        )
      )
  );
$$;

revoke all on function public.is_approved_organizer(uuid) from public;
grant execute on function public.is_approved_organizer(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- C1: events RLS gated on approved organizer
-- -----------------------------------------------------------------------------
drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
on public.events
for insert
to authenticated
with check (
  (select auth.uid()) = organizer_id
  and public.is_approved_organizer((select auth.uid()))
);

drop policy if exists "events_update_own" on public.events;
create policy "events_update_own"
on public.events
for update
to authenticated
using (
  (select auth.uid()) = organizer_id
  and public.is_approved_organizer((select auth.uid()))
)
with check (
  (select auth.uid()) = organizer_id
  and public.is_approved_organizer((select auth.uid()))
);

drop policy if exists "events_delete_own" on public.events;
create policy "events_delete_own"
on public.events
for delete
to authenticated
using (
  (select auth.uid()) = organizer_id
  and public.is_approved_organizer((select auth.uid()))
);

-- -----------------------------------------------------------------------------
-- C1: create_complete_event_tx requires approved admin (or super_admin)
-- Body matches 00009_rrpp_system.sql; only the auth gate changes.
-- -----------------------------------------------------------------------------
create or replace function public.create_complete_event_tx(
  payload jsonb,
  p_organizer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
  v_event_id uuid;
  v_zone_id uuid;
  v_zone_ids uuid[] := '{}';
  v_zone jsonb;
  v_tier jsonb;
  v_zone_index integer;
  v_zone_type public.zone_type;
  v_zone_capacity integer;
  v_rows integer;
  v_seats_per_row integer;
  v_row_idx integer;
  v_seat_idx integer;
  v_row_label text;
  v_venue_name text;
  v_venue_location text;
  v_venue_capacity integer;
  v_title text;
  v_description text;
  v_date timestamptz;
  v_location text;
  v_image_url text;
  v_time_limit time;
  v_bonus_reward text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id) then
    raise exception 'Forbidden: no puedes crear eventos en nombre de otro usuario'
      using errcode = '42501';
  end if;

  if not public.is_approved_organizer(p_organizer_id) then
    raise exception
      'Forbidden: el organizador no está aprobado o no tiene permisos de productor'
      using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  v_title := nullif(btrim(payload ->> 'title'), '');
  v_description := nullif(btrim(payload ->> 'description'), '');
  v_location := nullif(btrim(payload ->> 'location'), '');
  v_image_url := coalesce(
    nullif(btrim(payload ->> 'flyer_url'), ''),
    nullif(btrim(payload ->> 'image_url'), '')
  );

  begin
    v_date := (payload ->> 'date')::timestamptz;
  exception
    when others then
      raise exception 'Fecha del evento inválida'
        using errcode = '22007';
  end;

  if v_title is null then
    raise exception 'El título del evento es obligatorio'
      using errcode = '22023';
  end if;

  if v_date is null then
    raise exception 'La fecha del evento es obligatoria'
      using errcode = '22023';
  end if;

  v_venue_name := nullif(btrim(payload #>> '{venue,name}'), '');
  v_venue_location := coalesce(
    nullif(btrim(payload #>> '{venue,location}'), ''),
    v_venue_name,
    v_location
  );
  v_venue_capacity := coalesce((payload #>> '{venue,capacity}')::integer, 0);

  if v_venue_name is null then
    raise exception 'El nombre del recinto es obligatorio'
      using errcode = '22023';
  end if;

  if v_venue_capacity <= 0 then
    raise exception 'La capacidad del recinto debe ser mayor a cero'
      using errcode = '22023';
  end if;

  if v_location is null then
    v_location := v_venue_location;
  end if;

  if payload -> 'zones' is null
     or jsonb_typeof(payload -> 'zones') <> 'array'
     or jsonb_array_length(payload -> 'zones') = 0 then
    raise exception 'Debes definir al menos una zona'
      using errcode = '22023';
  end if;

  if payload -> 'tiers' is null
     or jsonb_typeof(payload -> 'tiers') <> 'array'
     or jsonb_array_length(payload -> 'tiers') = 0 then
    raise exception 'Debes definir al menos un tipo de entrada'
      using errcode = '22023';
  end if;

  insert into public.venues (organizer_id, name, location, capacity)
  values (p_organizer_id, v_venue_name, v_venue_location, v_venue_capacity)
  returning id into v_venue_id;

  insert into public.events (
    organizer_id,
    title,
    description,
    date,
    location,
    image_url,
    flyer_url,
    venue_id,
    status
  )
  values (
    p_organizer_id,
    v_title,
    v_description,
    v_date,
    v_location,
    v_image_url,
    v_image_url,
    v_venue_id,
    'draft'::public.event_status
  )
  returning id into v_event_id;

  for v_zone in select value from jsonb_array_elements(payload -> 'zones')
  loop
    begin
      v_zone_type := (v_zone ->> 'type')::public.zone_type;
    exception
      when others then
        raise exception 'Tipo de zona inválido: %', v_zone ->> 'type'
          using errcode = '22P02';
    end;

    v_zone_capacity := coalesce((v_zone ->> 'capacity')::integer, 0);

    if nullif(btrim(v_zone ->> 'name'), '') is null then
      raise exception 'Cada zona debe tener un nombre' using errcode = '22023';
    end if;

    if v_zone_capacity <= 0 then
      raise exception 'La capacidad de la zona "%" debe ser mayor a cero',
        v_zone ->> 'name' using errcode = '22023';
    end if;

    insert into public.event_zones (event_id, name, type, capacity)
    values (v_event_id, btrim(v_zone ->> 'name'), v_zone_type, v_zone_capacity)
    returning id into v_zone_id;

    v_zone_ids := array_append(v_zone_ids, v_zone_id);

    if v_zone_type = 'reserved_seating'::public.zone_type then
      v_rows := coalesce((v_zone ->> 'rows')::integer, 0);
      v_seats_per_row := coalesce((v_zone ->> 'seats_per_row')::integer, 0);

      if v_rows <= 0 or v_seats_per_row <= 0 then
        raise exception 'La zona "%" requiere filas y asientos por fila',
          v_zone ->> 'name' using errcode = '22023';
      end if;

      if (v_rows * v_seats_per_row) > 5000 then
        raise exception 'La zona "%" supera el máximo de 5000 asientos por creación',
          v_zone ->> 'name' using errcode = '22023';
      end if;

      for v_row_idx in 1..v_rows loop
        if v_row_idx <= 26 then
          v_row_label := chr(64 + v_row_idx);
        else
          v_row_label :=
            chr(64 + ((v_row_idx - 1) / 26))
            || chr(65 + ((v_row_idx - 1) % 26));
        end if;

        for v_seat_idx in 1..v_seats_per_row loop
          insert into public.seats (zone_id, row_label, seat_number, status)
          values (
            v_zone_id,
            v_row_label,
            v_seat_idx::text,
            'available'::public.seat_status
          );
        end loop;
      end loop;
    end if;
  end loop;

  for v_tier in select value from jsonb_array_elements(payload -> 'tiers')
  loop
    if nullif(btrim(v_tier ->> 'name'), '') is null then
      raise exception 'Cada tier debe tener un nombre' using errcode = '22023';
    end if;

    if coalesce((v_tier ->> 'capacity')::integer, 0) < 1 then
      raise exception 'La capacidad del tier "%" debe ser mayor a cero',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    if coalesce((v_tier ->> 'price')::numeric, -1) < 0 then
      raise exception 'El precio del tier "%" no puede ser negativo',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    v_zone_index := coalesce((v_tier ->> 'zone_index')::integer, 0);
    v_zone_id := null;

    if v_zone_index >= 0 and v_zone_index < cardinality(v_zone_ids) then
      v_zone_id := v_zone_ids[v_zone_index + 1];
    end if;

    v_time_limit := null;
    if nullif(btrim(v_tier ->> 'time_limit'), '') is not null then
      begin
        v_time_limit := (v_tier ->> 'time_limit')::time;
      exception
        when others then
          raise exception 'time_limit inválido en tier "%"', v_tier ->> 'name'
            using errcode = '22007';
      end;
    end if;

    v_bonus_reward := nullif(btrim(v_tier ->> 'bonus_reward'), '');

    insert into public.ticket_tiers (
      event_id, name, price, capacity, sold, time_limit, bonus_reward, zone_id
    )
    values (
      v_event_id,
      btrim(v_tier ->> 'name'),
      (v_tier ->> 'price')::numeric(12, 2),
      (v_tier ->> 'capacity')::integer,
      0,
      v_time_limit,
      v_bonus_reward,
      v_zone_id
    );
  end loop;

  return v_event_id;

exception
  when others then
    raise exception 'create_complete_event_tx: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

comment on function public.create_complete_event_tx(jsonb, uuid) is
  'Crea venue, event (draft + flyer), zones, seats y tiers. Exige organizador aprobado.';

-- -----------------------------------------------------------------------------
-- C3 + C4: atomic finalize — paid only if tickets activate; expired → needs_refund
-- -----------------------------------------------------------------------------
create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_mp_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_pending_tickets integer := 0;
  v_valid_tickets integer := 0;
  v_activated integer := 0;
  v_updated integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null or nullif(btrim(p_mp_payment_id), '') is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  select count(*)::integer
    into v_pending_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'pending_payment'::public.ticket_status;

  select count(*)::integer
    into v_valid_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'valid'::public.ticket_status;

  -- Idempotent success / repair path
  if v_order.status = 'paid'
     and v_order.mp_payment_id is not distinct from p_mp_payment_id then
    if v_pending_tickets > 0 then
      update public.tickets
      set
        status = 'valid'::public.ticket_status,
        updated_at = now()
      where order_id = p_order_id
        and status = 'pending_payment'::public.ticket_status;
    end if;

    begin
      perform public.activate_order_item_redemptions(p_order_id);
    exception
      when undefined_function then
        null;
    end;

    return jsonb_build_object(
      'ok', true,
      'code', 'already_paid',
      'idempotent', true
    );
  end if;

  if v_order.status = 'paid'
     and v_order.mp_payment_id is distinct from p_mp_payment_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_paid_other_payment',
      'mp_payment_id', v_order.mp_payment_id
    );
  end if;

  -- Cron won the race: stock restored / tickets cancelled — do not revive
  if v_order.status = 'expired' then
    return jsonb_build_object(
      'ok', false,
      'code', 'order_expired',
      'needs_refund', true
    );
  end if;

  if v_order.status is distinct from 'pending' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'status', v_order.status
    );
  end if;

  if v_pending_tickets = 0 and v_valid_tickets = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_tickets',
      'needs_refund', true
    );
  end if;

  if v_pending_tickets > 0 then
    update public.tickets
    set
      status = 'valid'::public.ticket_status,
      updated_at = now()
    where order_id = p_order_id
      and status = 'pending_payment'::public.ticket_status;

    get diagnostics v_activated = row_count;

    if v_activated is distinct from v_pending_tickets then
      raise exception 'TICKET_ACTIVATION_MISMATCH'
        using errcode = 'P0001';
    end if;
  end if;

  begin
    perform public.activate_order_item_redemptions(p_order_id);
  exception
    when undefined_function then
      null;
  end;

  update public.orders
  set
    status = 'paid',
    mp_payment_id = p_mp_payment_id,
    updated_at = now()
  where id = p_order_id
    and status = 'pending';

  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    -- Concurrent expire/failure — full rollback of ticket activation
    raise exception 'ORDER_STATUS_RACE'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'paid',
    'tickets_activated', coalesce(v_activated, 0),
    'idempotent', false
  );
end;
$$;

revoke all on function public.finalize_paid_order(uuid, text) from public;
revoke all on function public.finalize_paid_order(uuid, text)
  from anon, authenticated;
grant execute on function public.finalize_paid_order(uuid, text) to service_role;

comment on function public.finalize_paid_order(uuid, text) is
  'Marca orden paid solo tras activar tickets en la misma transacción; expired → needs_refund.';

-- -----------------------------------------------------------------------------
-- C5: finance summary — POS excluded from liquidable net
-- -----------------------------------------------------------------------------
create or replace function public.get_organizer_finance_summary(p_organizer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gross numeric(14, 2) := 0;
  v_mp_gross numeric(14, 2) := 0;
  v_pos_cash numeric(14, 2) := 0;
  v_mp_fees numeric(14, 2) := 0;
  v_net_liquidable numeric(14, 2) := 0;
  v_settled numeric(14, 2) := 0;
  v_pending_settlement numeric(14, 2) := 0;
  v_available numeric(14, 2) := 0;
  v_settlements jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with paid_orders as (
    select distinct o.id, o.total_amount, o.service_charge, o.subtotal, o.payment_method
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
  )
  select
    coalesce(sum(total_amount), 0),
    coalesce(
      sum(
        case
          when payment_method = 'mercadopago' then total_amount
          else 0
        end
      ),
      0
    ),
    coalesce(
      sum(
        case
          when payment_method in ('cash_pos', 'transfer_pos') then total_amount
          else 0
        end
      ),
      0
    ),
    coalesce(
      sum(
        case
          when payment_method = 'mercadopago' then service_charge
          else 0
        end
      ),
      0
    )
  into v_gross, v_mp_gross, v_pos_cash, v_mp_fees
  from paid_orders;

  -- Platform settles only MP money; POS cash already sits with the organizer.
  v_net_liquidable := round(v_mp_gross - v_mp_fees, 2);

  select coalesce(sum(net_amount), 0)
    into v_settled
  from public.organizer_settlements
  where organizer_id = p_organizer_id
    and status = 'completed';

  select coalesce(sum(net_amount), 0)
    into v_pending_settlement
  from public.organizer_settlements
  where organizer_id = p_organizer_id
    and status = 'pending';

  v_available := greatest(0, v_net_liquidable - v_settled - v_pending_settlement);

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'grossAmount', s.gross_amount,
          'platformFee', s.platform_fee,
          'netAmount', s.net_amount,
          'status', s.status,
          'periodLabel', s.period_label,
          'notes', s.notes,
          'completedAt', s.completed_at,
          'createdAt', s.created_at
        )
        order by s.created_at desc
      )
      from (
        select *
        from public.organizer_settlements
        where organizer_id = p_organizer_id
        order by created_at desc
        limit 50
      ) as s
    ),
    '[]'::jsonb
  )
  into v_settlements;

  return jsonb_build_object(
    'grossRevenue', v_gross,
    'platformFees', v_mp_fees,
    'netRevenue', v_net_liquidable,
    'mercadopagoGross', v_mp_gross,
    'posGross', v_pos_cash,
    'mpGrossTotal', v_mp_gross,
    'posCashTotal', v_pos_cash,
    'netLiquidable', v_net_liquidable,
    'settledNet', v_settled,
    'pendingSettlementNet', v_pending_settlement,
    'availableToSettle', v_available,
    'settlements', v_settlements
  );
end;
$$;
