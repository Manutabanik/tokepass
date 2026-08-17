-- =============================================================================
-- P87 - Residual B2B audit sync
-- 1) Shared paid-order ledger for metrics + finance_summary
-- 2) Re-materialize event_seating_units whenever venue_map / seating_layout
--    changes, including drafts
-- 3) table_combo SKU capacity is physical units; sold += 1 per reserved unit
-- =============================================================================

comment on column public.ticket_tiers.capacity is
  'Unidades vendibles del SKU. Para layout_type=table_combo (mesa/palco group) es la cantidad de unidades fisicas, no sillas x mesas. sold incrementa 1 por unidad reservada.';

comment on column public.ticket_tiers.capacity_per_unit is
  'Personas por unidad fisica (sillas de la mesa/palco). No se multiplica en ticket_tiers.capacity ni en sold.';

-- ---------------------------------------------------------------------------
-- Libro mayor unico: misma consulta paid_orders para home y finanzas
-- ---------------------------------------------------------------------------
create or replace function public.organizer_paid_ledger(p_organizer_id uuid)
returns table (
  gross_revenue numeric(14, 2),
  tokepass_service_charge numeric(14, 2),
  organizer_net_payout numeric(14, 2),
  mp_gross numeric(14, 2),
  pos_gross numeric(14, 2),
  mp_fees numeric(14, 2),
  pos_fees numeric(14, 2)
)
language sql
stable
security invoker
set search_path = ''
as $$
  with paid_orders as (
    select distinct o.id, o.total_amount, o.service_charge, o.payment_method
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
  )
  select
    coalesce(sum(total_amount), 0)::numeric(14, 2),
    coalesce(sum(service_charge), 0)::numeric(14, 2),
    round(
      coalesce(sum(total_amount), 0) - coalesce(sum(service_charge), 0),
      2
    )::numeric(14, 2),
    coalesce(
      sum(case when payment_method = 'mercadopago' then total_amount else 0 end),
      0
    )::numeric(14, 2),
    coalesce(
      sum(
        case
          when payment_method in ('cash_pos', 'transfer_pos') then total_amount
          else 0
        end
      ),
      0
    )::numeric(14, 2),
    coalesce(
      sum(case when payment_method = 'mercadopago' then service_charge else 0 end),
      0
    )::numeric(14, 2),
    coalesce(
      sum(
        case
          when payment_method in ('cash_pos', 'transfer_pos') then service_charge
          else 0
        end
      ),
      0
    )::numeric(14, 2)
  from paid_orders;
$$;

comment on function public.organizer_paid_ledger(uuid) is
  'Fuente unica del libro mayor paid-only. GMV = SUM(orders.total_amount) WHERE status=paid. Usada por get_organizer_metrics y get_organizer_finance_summary.';

revoke all on function public.organizer_paid_ledger(uuid) from public;
revoke all on function public.organizer_paid_ledger(uuid) from anon;
revoke all on function public.organizer_paid_ledger(uuid) from authenticated;

create or replace function public.get_organizer_metrics(p_organizer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gross_revenue numeric(14, 2) := 0;
  v_tokepass_service_charge numeric(14, 2) := 0;
  v_organizer_net_payout numeric(14, 2) := 0;
  v_tickets_sold integer := 0;
  v_active_events integer := 0;
  v_recent_sales jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id) then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = p_organizer_id
      and profiles.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Forbidden: el usuario no es organizador'
      using errcode = '42501';
  end if;

  select
    l.gross_revenue,
    l.tokepass_service_charge,
    l.organizer_net_payout
  into
    v_gross_revenue,
    v_tokepass_service_charge,
    v_organizer_net_payout
  from public.organizer_paid_ledger(p_organizer_id) as l;

  select coalesce(count(*)::integer, 0)
    into v_tickets_sold
  from public.tickets as t
  join public.events as e on e.id = t.event_id
  join public.orders as o on o.id = t.order_id
  where e.organizer_id = p_organizer_id
    and o.status = 'paid'
    and t.status not in (
      'pending_payment'::public.ticket_status,
      'cancelled'::public.ticket_status,
      'revoked'::public.ticket_status
    );

  select coalesce(count(*)::integer, 0)
    into v_active_events
  from public.events as e
  where e.organizer_id = p_organizer_id
    and e.status = 'published'::public.event_status;

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'date', x.created_at,
          'amount', x.total_amount,
          'status', x.status,
          'buyer_name', x.buyer_name
        )
        order by x.created_at desc
      )
      from (
        select
          o.id,
          o.created_at,
          o.total_amount,
          o.status,
          coalesce(
            nullif(btrim(p.full_name), ''),
            p.email,
            'Comprador'
          ) as buyer_name
        from public.orders as o
        left join public.profiles as p on p.id = o.buyer_id
        where o.status = 'paid'
          and exists (
            select 1
            from public.tickets as t
            join public.events as e on e.id = t.event_id
            where t.order_id = o.id
              and e.organizer_id = p_organizer_id
          )
        order by o.created_at desc
        limit 5
      ) as x
    ),
    '[]'::jsonb
  )
    into v_recent_sales;

  return jsonb_build_object(
    'gross_revenue', v_gross_revenue,
    'tokepass_service_charge', v_tokepass_service_charge,
    'organizer_net_payout', v_organizer_net_payout,
    'total_revenue', v_gross_revenue,
    'tickets_sold', v_tickets_sold,
    'active_events', v_active_events,
    'recent_sales', v_recent_sales
  );
end;
$$;

comment on function public.get_organizer_metrics(uuid) is
  'KPIs del organizador. Recaudacion y comisiones salen de organizer_paid_ledger (mismas ordenes paid que finance_summary).';

revoke all on function public.get_organizer_metrics(uuid) from public;
revoke all on function public.get_organizer_metrics(uuid) from anon;
grant execute on function public.get_organizer_metrics(uuid)
  to authenticated, service_role;

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
  v_pos_fees numeric(14, 2) := 0;
  v_platform_fees numeric(14, 2) := 0;
  v_organizer_net numeric(14, 2) := 0;
  v_net_liquidable numeric(14, 2) := 0;
  v_settled numeric(14, 2) := 0;
  v_pending_settlement numeric(14, 2) := 0;
  v_pending_payouts numeric(14, 2) := 0;
  v_completed_payouts numeric(14, 2) := 0;
  v_retained numeric(14, 2) := 0;
  v_available numeric(14, 2) := 0;
  v_settlements jsonb := '[]'::jsonb;
  v_payouts jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select
    l.gross_revenue,
    l.tokepass_service_charge,
    l.organizer_net_payout,
    l.mp_gross,
    l.pos_gross,
    l.mp_fees,
    l.pos_fees
  into
    v_gross,
    v_platform_fees,
    v_organizer_net,
    v_mp_gross,
    v_pos_cash,
    v_mp_fees,
    v_pos_fees
  from public.organizer_paid_ledger(p_organizer_id) as l;

  v_net_liquidable := round(v_mp_gross - v_mp_fees, 2);

  with future_paid as (
    select distinct o.id, o.total_amount, o.service_charge, o.payment_method
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
      and e.date > now()
      and o.payment_method = 'mercadopago'
  )
  select coalesce(sum(total_amount - service_charge), 0)
    into v_retained
  from future_paid;

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

  select coalesce(sum(amount), 0)
    into v_pending_payouts
  from public.payout_requests
  where organizer_id = p_organizer_id
    and status in (
      'pending'::public.payout_request_status,
      'processing'::public.payout_request_status
    );

  select coalesce(sum(amount), 0)
    into v_completed_payouts
  from public.payout_requests
  where organizer_id = p_organizer_id
    and status = 'completed'::public.payout_request_status;

  v_available := greatest(
    0,
    v_net_liquidable
      - v_settled
      - v_completed_payouts
      - v_pending_settlement
      - v_pending_payouts
      - v_retained
  );

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

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'amount', p.amount,
          'status', p.status,
          'cbuDestination', p.cbu_destination,
          'eventId', p.event_id,
          'adminNotes', p.admin_notes,
          'createdAt', p.created_at,
          'updatedAt', p.updated_at,
          'reviewedAt', p.reviewed_at
        )
        order by p.created_at desc
      )
      from (
        select *
        from public.payout_requests
        where organizer_id = p_organizer_id
        order by created_at desc
        limit 50
      ) as p
    ),
    '[]'::jsonb
  )
  into v_payouts;

  return jsonb_build_object(
    'grossRevenue', v_gross,
    'platformFees', v_platform_fees,
    'mpPlatformFees', v_mp_fees,
    'posPlatformFees', v_pos_fees,
    'netRevenue', v_organizer_net,
    'gross_revenue', v_gross,
    'tokepass_service_charge', v_platform_fees,
    'organizer_net_payout', v_organizer_net,
    'mercadopagoGross', v_mp_gross,
    'posGross', v_pos_cash,
    'mpGrossTotal', v_mp_gross,
    'posCashTotal', v_pos_cash,
    'netLiquidable', v_net_liquidable,
    'settledNet', v_settled + v_completed_payouts,
    'pendingSettlementNet', v_pending_settlement + v_pending_payouts,
    'retainedHeld', v_retained,
    'availableToSettle', v_available,
    'platformFeeDebt', v_pos_fees,
    'settlements', v_settlements,
    'payoutRequests', v_payouts
  );
end;
$$;

comment on function public.get_organizer_finance_summary(uuid) is
  'Finanzas del organizador. gross_revenue / tokepass_service_charge / organizer_net_payout salen de organizer_paid_ledger, identicas al panel de inicio.';

-- ---------------------------------------------------------------------------
-- Materializar unidades en cada cambio de seating_layout / guardado de mapa
-- ---------------------------------------------------------------------------
create or replace function public.resync_event_seating_after_venue_layout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if tg_op = 'UPDATE'
     and old.seating_layout is not distinct from new.seating_layout
     and old.venue_map is not distinct from new.venue_map then
    return new;
  end if;

  for v_event_id in
    select e.id
    from public.events as e
    where e.venue_id = new.id
      and e.status <> 'cancelled'::public.event_status
  loop
    begin
      perform public.materialize_event_seating_units(v_event_id);
    exception
      when others then
        raise warning 'resync_event_seating_after_venue_layout %: %',
          v_event_id,
          sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

comment on function public.resync_event_seating_after_venue_layout() is
  'Al persistir venue_map / seating_layout, re-instancia event_seating_units de los eventos del recinto.';

create or replace function public.materialize_event_seating_units(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is not null
     and not public.owns_event(p_event_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform set_config('tokepass.force_seating_sync', 'on', true);

  update public.ticket_tiers as tt
  set seating_sector_id = tt.seating_sector_id
  where tt.event_id = p_event_id
    and tt.layout_type <> 'general'
    and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.materialize_event_seating_units(uuid) is
  'Genera event_seating_units desde venues.seating_layout. Se llama al guardar el mapa (create/update_complete_event_with_seating_tx) y al publicar.';

create or replace function public.update_complete_event_with_seating_tx(
  p_event_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_organizer_id uuid;
  v_category_id uuid;
  v_age public.event_age_restriction;
  v_ends_at timestamptz;
  v_age_raw text;
begin
  select e.organizer_id
    into v_organizer_id
  from public.events as e
  where e.id = p_event_id;

  if v_organizer_id is null then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or (
         auth.uid() is distinct from v_organizer_id
         and not public.is_super_admin()
       )
     ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.is_approved_organizer(v_organizer_id) then
    raise exception 'ORGANIZER_NOT_APPROVED' using errcode = '42501';
  end if;

  begin
    v_category_id := nullif(btrim(payload ->> 'category_id'), '')::uuid;
  exception
    when others then
      raise exception 'category_id inválido' using errcode = '22P02';
  end;

  if v_category_id is not null
     and not exists (
       select 1
       from public.event_categories as c
       where c.id = v_category_id
         and c.is_active
     ) then
    raise exception 'Categoría inexistente o inactiva'
      using errcode = '22023';
  end if;

  v_age_raw := lower(coalesce(nullif(btrim(payload ->> 'age_restriction'), ''), 'atp'));
  if v_age_raw not in ('atp', '16', '18') then
    raise exception 'Restricción de edad inválida'
      using errcode = '22023';
  end if;
  v_age := v_age_raw::public.event_age_restriction;

  v_ends_at := null;
  if nullif(btrim(payload ->> 'ends_at'), '') is not null then
    begin
      v_ends_at := (payload ->> 'ends_at')::timestamptz;
    exception
      when others then
        raise exception 'Hora de finalización inválida'
          using errcode = '22007';
    end;
  end if;

  v_event_id := public.update_complete_event_tx(p_event_id, payload);

  update public.events
  set
    category_id = v_category_id,
    age_restriction = v_age,
    ends_at = v_ends_at,
    updated_at = now()
  where id = v_event_id;

  perform public.configure_event_seating_tiers(
    v_event_id,
    coalesce(payload -> 'tiers', '[]'::jsonb)
  );

  perform public.materialize_event_seating_units(v_event_id);

  return v_event_id;
end;
$$;

revoke all on function public.update_complete_event_with_seating_tx(uuid, jsonb)
  from public, anon;
grant execute on function public.update_complete_event_with_seating_tx(uuid, jsonb)
  to authenticated, service_role;
