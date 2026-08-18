-- P99 · Concurrencia, pagos e RLS
-- 1) Sector logico: advisory lock + trigger AFTER sold (cubre checkout, POS, cortesia).
-- 2) Unicidad de transaccion PSP en orders.
-- 3) RPC financiera solo para organizador aprobado.
-- 4) Cierre de grants en funciones/tablas antifraude.

-- ---------------------------------------------------------------------------
-- 1) Stock de sector general:* — serializar el SUM entre SKUs del mismo zona
-- ---------------------------------------------------------------------------
create or replace function public.assert_logical_sector_stock(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sector text;
  v_slug text;
  v_zone public.event_zones%rowtype;
  v_used integer := 0;
  v_additional integer := greatest(0, coalesce(p_quantity, 0));
begin
  select nullif(btrim(coalesce(tt.seating_sector_id, '')), '')
    into v_sector
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
    and tt.event_id = p_event_id;

  if v_sector is null or v_sector not like 'general:%' then
    return;
  end if;

  -- Serializa checkouts concurrentes del mismo sector sin deadlock entre SKUs.
  perform pg_advisory_xact_lock(
    hashtext(p_event_id::text),
    hashtext(v_sector)
  );

  perform 1
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  v_slug := lower(split_part(v_sector, ':', 2));

  select z.*
    into v_zone
  from public.event_zones as z
  where z.event_id = p_event_id
    and z.type = 'general_admission'
    and (
      lower(replace(z.name, ' ', '-')) = v_slug
      or lower(z.name) = replace(v_slug, '-', ' ')
    )
  order by z.id
  for update of z
  limit 1;

  if not found then
    return;
  end if;

  select coalesce(sum(tt.sold), 0)::integer
    into v_used
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.seating_sector_id = v_sector;

  if (v_used + v_additional) > v_zone.capacity then
    raise exception 'INVENTORY_CONFLICT_409'
      using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.assert_logical_sector_stock(uuid, uuid, integer) is
  'Serializa el cupo general:* con pg_advisory_xact_lock + FOR UPDATE del zone. p_quantity=0 valida el sold actual (trigger).';

create or replace function public.enforce_logical_sector_capacity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(new.sold, 0) <= coalesce(old.sold, 0) then
    return new;
  end if;

  perform public.assert_logical_sector_stock(new.event_id, new.id, 0);
  return new;
end;
$$;

drop trigger if exists ticket_tiers_enforce_logical_sector on public.ticket_tiers;
create trigger ticket_tiers_enforce_logical_sector
after insert or update of sold
on public.ticket_tiers
for each row
execute function public.enforce_logical_sector_capacity();

comment on function public.enforce_logical_sector_capacity() is
  'AFTER sold: revalida el cupo del sector. Cubre POS, listas y cortesia que no llaman assert_cascade.';

-- POS: mismos invariantes de fase/recinto/sector que el checkout web, sin
-- exigir fase online (el trigger de fase/recinto ya corre en sold++).
create or replace function public.process_pos_checkout_tx(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_cashier_user_id uuid,
  p_customer_phone text default null,
  p_customer_dni text default null,
  p_customer_name text default null,
  p_shift_id uuid default null,
  p_supervisor_pin text default null,
  p_seating_unit_id uuid default null,
  p_seating_layout_item_id text default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  totp_secret text,
  qr_code text,
  unit_price numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_event public.events%rowtype;
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event uuid;
  v_admit integer;
  v_tier_name text;
  v_layout text;
  v_order_id uuid;
  v_subtotal numeric(12, 2);
  v_method text;
  v_phone text;
  v_dni text;
  v_name text;
  v_unit integer;
  v_slot integer;
  v_ticket_id uuid;
  v_secret text;
  v_qr text;
  v_group_id uuid;
  v_rate numeric(5, 4) := 0.15;
  v_shift public.cashier_shifts%rowtype;
  v_needs_pin boolean := false;
  v_layout_item text;
  v_seating public.event_seating_units%rowtype;
  v_has_seating boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_cashier_user_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_method := public.normalize_pos_payment_method(p_payment_method);
  if v_method is null then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  v_dni := nullif(regexp_replace(coalesce(p_customer_dni, ''), '\D', '', 'g'), '');
  if v_dni is null or length(v_dni) < 7 or length(v_dni) > 11 then
    raise exception 'DNI_REQUIRED' using errcode = '22023';
  end if;

  v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  if v_name is null then
    v_name := 'Comprador POS';
  end if;

  v_layout_item := nullif(btrim(coalesce(p_seating_layout_item_id, '')), '');
  v_has_seating := p_seating_unit_id is not null or v_layout_item is not null;
  if v_has_seating and p_quantity <> 1 then
    raise exception 'SEATING_QTY_ONE' using errcode = '23514';
  end if;

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.user_can_operate_pos(p_event_id, p_cashier_user_id) then
    raise exception 'FORBIDDEN_EVENT' using errcode = '42501';
  end if;

  if v_event.status::text not in ('published', 'draft') then
    raise exception 'EVENT_NOT_SELLABLE' using errcode = '23514';
  end if;

  if p_shift_id is not null then
    select * into v_shift
    from public.cashier_shifts s
    where s.id = p_shift_id
    for update of s;
  else
    select * into v_shift
    from public.cashier_shifts s
    where s.event_id = p_event_id
      and s.cashier_id = p_cashier_user_id
      and s.status = 'open'
    for update of s
    limit 1;
  end if;

  if not found then
    raise exception 'SHIFT_REQUIRED' using errcode = 'P0001';
  end if;

  if v_shift.status <> 'open'
     or v_shift.event_id is distinct from p_event_id
     or v_shift.cashier_id is distinct from p_cashier_user_id then
    raise exception 'SHIFT_INVALID' using errcode = '23514';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_event.organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  select
    tt.event_id,
    tt.price,
    coalesce(
      tt.platform_fee,
      public.all_in_platform_fee(coalesce(tt.base_price, tt.price), v_rate)
    ),
    tt.capacity,
    tt.sold,
    greatest(1, least(50, coalesce(tt.admit_count, 1))),
    tt.name,
    tt.layout_type::text
    into
      v_tier_event,
      v_price,
      v_unit_fee,
      v_capacity,
      v_sold,
      v_admit,
      v_tier_name,
      v_layout
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found then
    raise exception 'TIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tier_event is distinct from p_event_id then
    raise exception 'TIER_EVENT_MISMATCH' using errcode = '23514';
  end if;

  if v_has_seating then
    if p_seating_unit_id is not null then
      select * into v_seating
      from public.event_seating_units as u
      where u.id = p_seating_unit_id
        and u.event_id = p_event_id
      for update of u;
    else
      select * into v_seating
      from public.event_seating_units as u
      where u.event_id = p_event_id
        and u.layout_item_id = v_layout_item
        and u.tier_id = p_tier_id
      for update of u
      limit 1;
    end if;

    if not found then
      raise exception 'SEATING_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_seating.tier_id is distinct from p_tier_id then
      raise exception 'SEATING_TIER_MISMATCH' using errcode = '23514';
    end if;

    if v_seating.status::text <> 'available' then
      raise exception 'Sold out' using errcode = 'P0001';
    end if;
  end if;

  v_needs_pin :=
    coalesce(v_price, 0) <= 0
    or lower(coalesce(v_tier_name, '')) like '%freepass%'
    or lower(coalesce(v_tier_name, '')) like '%cortes%';

  if v_needs_pin then
    if not public.verify_pos_supervisor_pin(p_event_id, p_supervisor_pin) then
      raise exception 'SUPERVISOR_PIN_REQUIRED' using errcode = '42501';
    end if;
    v_unit_fee := 0;
    v_price := 0;
  end if;

  perform public.assert_logical_sector_stock(
    p_event_id,
    p_tier_id,
    p_quantity
  );

  if (v_capacity - v_sold) < p_quantity then
    raise exception 'Sold out' using errcode = 'P0001';
  end if;

  update public.ticket_tiers
  set sold = sold + p_quantity
  where id = p_tier_id;

  v_subtotal := round(v_price * p_quantity, 2);
  v_phone := nullif(btrim(coalesce(p_customer_phone, '')), '');

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    payment_method,
    customer_phone,
    cashier_shift_id,
    cashier_user_id
  )
  values (
    p_cashier_user_id,
    v_subtotal,
    round(v_unit_fee * p_quantity, 2),
    v_subtotal,
    'paid',
    v_method,
    v_phone,
    v_shift.id,
    p_cashier_user_id
  )
  returning id into v_order_id;

  if v_has_seating then
    update public.event_seating_units
    set
      status = 'sold',
      sold_order_id = v_order_id,
      reserved_by = null,
      reserved_order_id = null,
      reserved_until = null,
      updated_at = now()
    where id = v_seating.id
      and status::text = 'available';

    if not found then
      raise exception 'Sold out' using errcode = 'P0001';
    end if;
  end if;

  for v_unit in 1..p_quantity loop
    v_group_id := case when v_admit > 1 then gen_random_uuid() else null end;

    for v_slot in 1..v_admit loop
      v_secret := encode(extensions.gen_random_bytes(24), 'hex');
      v_qr := 'pos_' || replace(gen_random_uuid()::text, '-', '');

      insert into public.tickets (
        event_id,
        tier_id,
        owner_id,
        qr_code,
        status,
        order_id,
        is_dynamic_qr,
        totp_secret,
        holder_name,
        holder_dni,
        group_id,
        group_slot,
        max_admissions,
        admissions_used,
        seating_unit_id
      )
      values (
        p_event_id,
        p_tier_id,
        p_cashier_user_id,
        v_qr,
        'valid'::public.ticket_status,
        v_order_id,
        false,
        v_secret,
        v_name,
        v_dni,
        v_group_id,
        case when v_admit > 1 then v_slot else null end,
        1,
        0,
        case when v_has_seating then v_seating.id else null end
      )
      returning id into v_ticket_id;

      order_id := v_order_id;
      ticket_id := v_ticket_id;
      totp_secret := v_secret;
      qr_code := v_qr;
      unit_price := v_price;
      total_amount := v_subtotal;
      return next;
    end loop;

    begin
      perform public.fulfill_tier_combo_items(
        v_order_id,
        p_tier_id,
        p_cashier_user_id,
        'valid'
      );
    exception
      when undefined_function then null;
    end;
  end loop;

  update public.cashier_shifts
  set
    cash_sales_total = cash_sales_total
      + case when v_method = 'cash_pos' then v_subtotal else 0 end,
    card_sales_total = card_sales_total
      + case when v_method = 'card_pos' then v_subtotal else 0 end,
    transfer_sales_total = transfer_sales_total
      + case when v_method = 'transfer_pos' then v_subtotal else 0 end,
    tickets_sold = tickets_sold + (p_quantity * v_admit),
    updated_at = now()
  where id = v_shift.id;
end;
$$;

comment on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text
) is
  'Checkout presencial atomico. Valida cupo de sector antes de sold++. Fase/recinto los cubre el trigger de sold.';

-- ---------------------------------------------------------------------------
-- 2) Unicidad de transaccion PSP
-- ---------------------------------------------------------------------------
with ranked as (
  select
    o.id,
    row_number() over (
      partition by o.payment_provider, o.provider_transaction_id
      order by
        case when o.status = 'paid' then 0 else 1 end,
        o.updated_at desc nulls last,
        o.created_at desc nulls last,
        o.id desc
    ) as rn
  from public.orders as o
  where o.payment_provider is not null
    and o.provider_transaction_id is not null
    and btrim(o.provider_transaction_id) <> ''
)
update public.orders as o
set provider_transaction_id = null
from ranked as r
where o.id = r.id
  and r.rn > 1;

with ranked_mp as (
  select
    o.id,
    row_number() over (
      partition by o.mp_payment_id
      order by
        case when o.status = 'paid' then 0 else 1 end,
        o.updated_at desc nulls last,
        o.created_at desc nulls last,
        o.id desc
    ) as rn
  from public.orders as o
  where o.mp_payment_id is not null
    and btrim(o.mp_payment_id) <> ''
)
update public.orders as o
set mp_payment_id = null
from ranked_mp as r
where o.id = r.id
  and r.rn > 1;

drop index if exists public.idx_orders_provider_tx;

create unique index if not exists orders_provider_tx_uidx
  on public.orders (payment_provider, provider_transaction_id)
  where payment_provider is not null
    and provider_transaction_id is not null
    and btrim(provider_transaction_id) <> '';

create unique index if not exists orders_mp_payment_id_uidx
  on public.orders (mp_payment_id)
  where mp_payment_id is not null
    and btrim(mp_payment_id) <> '';

comment on index public.orders_provider_tx_uidx is
  'Un PSP transaction_id no puede acreditar dos orders.';

comment on index public.orders_mp_payment_id_uidx is
  'Un mp_payment_id no puede ligarse a dos orders.';

-- ---------------------------------------------------------------------------
-- 3) Finanzas: mismo gate de rol que get_organizer_metrics
-- ---------------------------------------------------------------------------
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

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin()
     and not public.is_approved_organizer(p_organizer_id) then
    raise exception 'Forbidden: el usuario no es organizador'
      using errcode = '42501';
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
  'Finanzas del organizador. Requiere service_role, super_admin o is_approved_organizer(uid).';

-- ---------------------------------------------------------------------------
-- 4) Grants: sondas de identidad y tablas antifraude
-- ---------------------------------------------------------------------------
revoke all on function public.count_guest_identity_tickets(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.count_guest_identity_tickets(uuid, text, text)
  to service_role;

revoke all on function public.is_rate_limited(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.is_rate_limited(text, integer, integer)
  to service_role;

revoke all on table public.checkout_security_events
  from public, anon, authenticated;
grant all on table public.checkout_security_events to service_role;

revoke all on table public.guest_access_challenges
  from public, anon, authenticated;
grant all on table public.guest_access_challenges to service_role;
