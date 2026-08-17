-- =============================================================================
-- P88 - Physical box office POS + RRPP affiliate checkout
-- process_pos_checkout_tx: paid instantaneo, metodos presenciales, cajero,
-- asientos/mesas atomicos. Staff: cashier | door_staff.
-- =============================================================================

alter table public.orders
  add column if not exists cashier_user_id uuid
    references public.profiles (id) on delete set null;

create index if not exists orders_cashier_user_id_idx
  on public.orders (cashier_user_id)
  where cashier_user_id is not null;

comment on column public.orders.cashier_user_id is
  'Cajero de boleteria que cobro la orden presencial. Null en ventas web.';

create or replace function public.user_can_operate_pos(
  p_event_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.user_is_event_organizer_or_staff(
    p_event_id,
    p_user_id,
    array[
      'cashier'::public.event_staff_role,
      'door_staff'::public.event_staff_role
    ]
  );
$$;

comment on function public.user_can_operate_pos(uuid, uuid) is
  'Organizador, cajero de boleteria (cashier) o door_staff pueden operar el POS.';

revoke all on function public.user_can_operate_pos(uuid, uuid) from public;
grant execute on function public.user_can_operate_pos(uuid, uuid)
  to authenticated, service_role;

create or replace function public.normalize_pos_payment_method(p_method text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_raw text := lower(btrim(coalesce(p_method, '')));
begin
  v_raw := replace(replace(v_raw, ' ', '_'), '-', '_');
  if v_raw in ('cash', 'efectivo', 'cash_pos') then
    return 'cash_pos';
  end if;
  if v_raw in ('card', 'card_pos', 'posnet', 'tarjeta') then
    return 'card_pos';
  end if;
  if v_raw in ('transfer', 'transfer_pos', 'transferencia') then
    return 'transfer_pos';
  end if;
  return null;
end;
$$;

revoke all on function public.normalize_pos_payment_method(text) from public;
grant execute on function public.normalize_pos_payment_method(text)
  to authenticated, service_role;

drop policy if exists cashier_shifts_select_own on public.cashier_shifts;
create policy cashier_shifts_select_own
  on public.cashier_shifts
  for select
  to authenticated
  using (
    cashier_id = auth.uid()
    or public.user_can_operate_pos(event_id, auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

create or replace function public.open_cashier_shift(
  p_event_id uuid,
  p_start_amount numeric default 0
)
returns public.cashier_shifts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.cashier_shifts;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_event_id is null then
    raise exception 'EVENT_REQUIRED' using errcode = '22023';
  end if;

  if coalesce(p_start_amount, 0) < 0 then
    raise exception 'INVALID_START_AMOUNT' using errcode = '22023';
  end if;

  if not public.user_can_operate_pos(p_event_id, v_uid) then
    raise exception 'FORBIDDEN_EVENT' using errcode = '42501';
  end if;

  select *
    into v_row
  from public.cashier_shifts s
  where s.event_id = p_event_id
    and s.cashier_id = v_uid
    and s.status = 'open'
  limit 1;

  if found then
    return v_row;
  end if;

  insert into public.cashier_shifts (
    event_id,
    cashier_id,
    start_amount,
    status
  )
  values (
    p_event_id,
    v_uid,
    coalesce(p_start_amount, 0),
    'open'
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.open_cashier_shift(uuid, numeric) from public;
grant execute on function public.open_cashier_shift(uuid, numeric)
  to authenticated, service_role;

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
  'Checkout presencial: omite pasarela, marca paid al instante, atribuye cashier_user_id y consume stock/asiento atomico.';

revoke all on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text
) from public;
grant execute on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text
) to authenticated, service_role;
