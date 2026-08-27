-- P176 · One day-match rule everywhere; POS checkout locks that row.
--
-- p174 required u.event_date_id = requested_day even on 1-jornada events.
-- Checkout/POS always send the schedule UUID, so undated single-day units
-- vanished and every seat looked sold or unpublished.
--
-- process_pos_checkout_tx still resolved layout_item_id with LIMIT 1 and no
-- jornada. The TS resolver is not the inventory core — the RPC is.
--
-- The same exact-day filter leaked into hold_seat / resolve_seat_hold_unit,
-- hold_seating_unit_for_cart_by_layout, and normalize_checkout_cart_items.
--
-- Numbered / mesa SKUs cannot be sold as GA (no seating_unit_id). That gate
-- lives in normalize_checkout_cart_items and process_pos_checkout_tx.

create or replace function public.seating_unit_matches_requested_day(
  p_unit_date uuid,
  p_requested_date uuid,
  p_day_count integer
)
returns boolean
language sql
immutable
as $$
  select case
    when coalesce(p_day_count, 0) >= 2 then
      p_requested_date is not null
      and p_unit_date = p_requested_date
    else
      p_requested_date is null
      or p_unit_date is null
      or p_unit_date = p_requested_date
  end;
$$;

comment on function public.seating_unit_matches_requested_day(uuid, uuid, integer) is
  'Multi-day: exact event_date_id. Single-day: requested date, undated, or no date asked.';

revoke all on function public.seating_unit_matches_requested_day(uuid, uuid, integer)
  from public, anon;
grant execute on function public.seating_unit_matches_requested_day(uuid, uuid, integer)
  to anon, authenticated, service_role;

create or replace function public.lock_pos_seating_unit(
  p_event_id uuid,
  p_tier_id uuid,
  p_seating_unit_id uuid,
  p_layout_item_id text,
  p_event_date_id uuid
)
returns public.event_seating_units
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_days integer := 0;
  v_layout text := nullif(btrim(coalesce(p_layout_item_id, '')), '');
begin
  select count(*)::integer
    into v_days
  from public.event_schedules
  where event_id = p_event_id;

  if coalesce(v_days, 0) >= 2
     and p_seating_unit_id is null
     and p_event_date_id is null then
    return null;
  end if;

  if p_seating_unit_id is not null then
    select * into v_unit
    from public.event_seating_units as u
    where u.id = p_seating_unit_id
      and u.event_id = p_event_id
    for update of u;
  else
    if v_layout is null then
      return null;
    end if;
    select * into v_unit
    from public.event_seating_units as u
    where u.event_id = p_event_id
      and u.layout_item_id = v_layout
      and u.tier_id = p_tier_id
      and public.seating_unit_matches_requested_day(
        u.event_date_id,
        p_event_date_id,
        v_days
      )
    order by
      case when u.event_date_id is not distinct from p_event_date_id then 0 else 1 end,
      u.id
    limit 1
    for update of u;
  end if;

  if not found then
    return null;
  end if;

  if not public.seating_unit_matches_requested_day(
    v_unit.event_date_id,
    p_event_date_id,
    v_days
  ) then
    return null;
  end if;

  return v_unit;
end;
$$;

revoke all on function public.lock_pos_seating_unit(uuid, uuid, uuid, text, uuid)
  from public, anon;
grant execute on function public.lock_pos_seating_unit(uuid, uuid, uuid, text, uuid)
  to authenticated, service_role;

-- Public inventory: same day-match rule
drop function if exists public.get_event_seating_units_by_sector(uuid, text);
drop function if exists public.get_event_seating_units_by_sector(uuid, text, uuid);
drop function if exists public.get_event_seating_availability(uuid);
drop function if exists public.get_event_seating_availability(uuid, uuid);

create function public.get_event_seating_units_by_sector(
  p_event_id uuid,
  p_sector_id text,
  p_event_date_id uuid default null
)
returns table (
  id uuid,
  tier_id uuid,
  sector_id text,
  sector_name text,
  layout_item_id text,
  label text,
  row_id text,
  row_number integer,
  row_label text,
  color text,
  layout_type text,
  capacity_per_unit integer,
  status text,
  reserved_until timestamptz,
  event_date_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_day_count integer := 0;
begin
  if p_sector_id is null or btrim(p_sector_id) = '' then
    return;
  end if;

  if not public.seating_catalog_is_readable(p_event_id) then
    return;
  end if;

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  if coalesce(v_day_count, 0) >= 2 and p_event_date_id is null then
    return;
  end if;

  return query
  select
    u.id,
    u.tier_id,
    u.sector_id,
    u.sector_name,
    u.layout_item_id,
    u.label,
    u.row_id,
    u.row_number,
    u.row_label,
    u.color,
    u.layout_type,
    u.capacity_per_unit,
    public.seating_unit_live_status(u.status, u.reserved_until),
    case
      when public.seating_unit_live_status(u.status, u.reserved_until) = 'reserved'
        then u.reserved_until
      else null
    end,
    u.event_date_id
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and tt.visibility = 'public'
    and public.seating_unit_matches_requested_day(
      u.event_date_id,
      p_event_date_id,
      v_day_count
    )
  order by
    u.row_number nulls last,
    u.row_label nulls last,
    u.label;
end;
$$;

create function public.get_event_seating_availability(
  p_event_id uuid,
  p_event_date_id uuid default null
)
returns table (
  id uuid,
  tier_id uuid,
  sector_id text,
  sector_name text,
  layout_item_id text,
  label text,
  row_id text,
  row_number integer,
  row_label text,
  color text,
  layout_type text,
  capacity_per_unit integer,
  status text,
  reserved_until timestamptz,
  event_date_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_allowed boolean := false;
  v_day_count integer := 0;
begin
  select
    (
      e.status = 'published'::public.event_status
      and e.visibility in ('public', 'private')
    )
    or (
      e.status in (
        'draft'::public.event_status,
        'paused'::public.event_status
      )
      and (
        coalesce(auth.role(), '') = 'service_role'
        or e.organizer_id = auth.uid()
        or public.is_super_admin()
      )
    )
  into v_allowed
  from public.events as e
  where e.id = p_event_id;

  if not coalesce(v_allowed, false) then
    return;
  end if;

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  if coalesce(v_day_count, 0) >= 2 and p_event_date_id is null then
    return;
  end if;

  return query
  select
    u.id,
    u.tier_id,
    u.sector_id,
    u.sector_name,
    u.layout_item_id,
    u.label,
    u.row_id,
    u.row_number,
    u.row_label,
    u.color,
    u.layout_type,
    u.capacity_per_unit,
    public.seating_unit_live_status(u.status, u.reserved_until),
    case
      when public.seating_unit_live_status(u.status, u.reserved_until) = 'reserved'
        then u.reserved_until
      else null
    end,
    u.event_date_id
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and tt.visibility = 'public'
    and public.seating_unit_matches_requested_day(
      u.event_date_id,
      p_event_date_id,
      v_day_count
    )
  order by
    u.sector_name,
    u.row_number nulls last,
    u.row_label nulls last,
    u.label;
end;
$$;

revoke all on function public.get_event_seating_units_by_sector(uuid, text, uuid)
  from public;
revoke all on function public.get_event_seating_availability(uuid, uuid)
  from public;
grant execute on function public.get_event_seating_units_by_sector(uuid, text, uuid)
  to anon, authenticated, service_role;
grant execute on function public.get_event_seating_availability(uuid, uuid)
  to anon, authenticated, service_role;

drop function if exists public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text
);
drop function if exists public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text, uuid
);

create function public.process_pos_checkout_tx(
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
  p_seating_layout_item_id text default null,
  p_event_date_id uuid default null
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
  v_live_stock boolean := false;
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

  v_live_stock := public.event_uses_live_stock(p_event_id);

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

  if v_layout in ('numbered_seat', 'table_combo') and not v_has_seating then
    raise exception 'SEAT_SELECTION_REQUIRED' using errcode = 'P0001';
  end if;

  if v_has_seating then
    v_seating := public.lock_pos_seating_unit(
      p_event_id,
      p_tier_id,
      p_seating_unit_id,
      v_layout_item,
      p_event_date_id
    );

    if v_seating.id is null then
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

  if v_live_stock then
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
  end if;

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
    cashier_user_id,
    is_test,
    environment
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
    p_cashier_user_id,
    not v_live_stock,
    case when v_live_stock then 'production' else 'test' end
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
        seating_unit_id,
        is_test
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
        case when v_has_seating then v_seating.id else null end,
        not v_live_stock
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

revoke all on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text, uuid
) from public, anon;
grant execute on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text, uuid
) to authenticated, service_role;

comment on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text, uuid
) is
  'POS checkout. Mapped seats lock via (event, layout, jornada); multi-day requires event_date_id.';

-- ---------------------------------------------------------------------------
-- Holds + cart normalize: same day-match helper (undated OK on 1 jornada)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_seat_hold_unit(
  p_seat_id text,
  p_event_date_id uuid,
  p_event_id uuid default null
)
returns public.event_seating_units
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_seat text := nullif(btrim(coalesce(p_seat_id, '')), '');
  v_uuid uuid;
  v_days integer := 0;
begin
  if v_seat is null then
    return null;
  end if;

  if p_event_id is not null then
    select count(*)::integer
      into v_days
    from public.event_schedules
    where event_id = p_event_id;
  end if;

  if p_event_id is not null
     and coalesce(v_days, 0) >= 2
     and p_event_date_id is null then
    return null;
  end if;

  begin
    v_uuid := v_seat::uuid;
  exception
    when invalid_text_representation then
      v_uuid := null;
  end;

  if v_uuid is not null then
    select * into v_unit
    from public.event_seating_units as u
    where u.id = v_uuid
      and (p_event_id is null or u.event_id = p_event_id)
    limit 1;

    if found then
      if p_event_id is null then
        select count(*)::integer
          into v_days
        from public.event_schedules
        where event_id = v_unit.event_id;
      end if;
      if not public.seating_unit_matches_requested_day(
        v_unit.event_date_id,
        p_event_date_id,
        v_days
      ) then
        return null;
      end if;
      return v_unit;
    end if;
  end if;

  select u.*
    into v_unit
  from public.event_seating_units as u
  where u.layout_item_id = v_seat
    and (p_event_id is null or u.event_id = p_event_id)
    and public.seating_unit_matches_requested_day(
      u.event_date_id,
      p_event_date_id,
      case
        when p_event_id is not null then v_days
        else (
          select count(*)::integer
          from public.event_schedules as s
          where s.event_id = u.event_id
        )
      end
    )
  order by
    case when u.event_date_id is not distinct from p_event_date_id then 0 else 1 end,
    case when u.status in ('available', 'reserved') then 0 else 1 end,
    u.id
  limit 1;

  return v_unit;
end;
$$;

comment on function public.resolve_seat_hold_unit(text, uuid, uuid) is
  'Resolves layout_item_id or unit UUID with seating_unit_matches_requested_day.';

create or replace function public.hold_seating_unit_for_cart_by_layout(
  p_event_id uuid,
  p_owner_id uuid,
  p_sector_id text,
  p_layout_item_id text,
  p_event_date_id uuid default null
)
returns table (seating_unit_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit_id uuid;
  v_schedule_days integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_sector_id is null or btrim(p_sector_id) = ''
     or p_layout_item_id is null or btrim(p_layout_item_id) = '' then
    raise exception 'SEATING_UNIT_NOT_MATERIALIZED' using errcode = 'P0002';
  end if;

  select count(*)::integer
    into v_schedule_days
  from public.event_schedules
  where event_id = p_event_id;

  if coalesce(v_schedule_days, 0) >= 2 and p_event_date_id is null then
    raise exception 'missing_event_date_id' using errcode = 'P0001';
  end if;

  if p_event_date_id is not null
     and not exists (
       select 1
       from public.event_schedules as s
       where s.id = p_event_date_id
         and s.event_id = p_event_id
     ) then
    raise exception 'missing_event_date_id' using errcode = 'P0001';
  end if;

  select u.id
    into v_unit_id
  from public.event_seating_units as u
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and u.layout_item_id = p_layout_item_id
    and public.seating_unit_matches_requested_day(
      u.event_date_id,
      p_event_date_id,
      v_schedule_days
    )
  order by
    case when u.event_date_id is not distinct from p_event_date_id then 0 else 1 end,
    case when u.status in ('available', 'reserved') then 0 else 1 end,
    u.id
  limit 1;

  if v_unit_id is null then
    raise exception 'SEATING_UNIT_NOT_MATERIALIZED' using errcode = 'P0002';
  end if;

  return query
  select *
  from public.hold_seating_unit_for_cart(
    p_event_id,
    p_owner_id,
    v_unit_id
  );
end;
$$;

comment on function public.hold_seating_unit_for_cart_by_layout(uuid, uuid, text, text, uuid) is
  'Resuelve layout_item_id con seating_unit_matches_requested_day.';

create or replace function public.normalize_checkout_cart_items(
  p_event_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_tier_id uuid;
  v_seat_id uuid;
  v_element_id text;
  v_event_date_id uuid;
  v_type text;
  v_quantity integer;
  v_resolved uuid;
  v_day_count integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVENTORY_CONFLICT_409'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_tier_id := public.checkout_cart_item_tier_id(v_item);
    v_seat_id := public.checkout_cart_item_seat_id(v_item);
    v_element_id := nullif(btrim(coalesce(
      v_item ->> 'element_id',
      v_item ->> 'elementId',
      ''
    )), '');
    v_event_date_id := null;
    begin
      v_event_date_id := nullif(btrim(coalesce(
        v_item ->> 'event_date_id',
        v_item ->> 'eventDateId',
        v_item ->> 'dateId',
        ''
      )), '')::uuid;
    exception
      when others then
        v_event_date_id := null;
    end;
    v_type := lower(nullif(btrim(coalesce(v_item ->> 'type', '')), ''));
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_type is null then
      v_type := case
        when v_seat_id is not null or v_element_id is not null then 'mapped'
        else 'general'
      end;
    end if;

    if v_type = 'mapped' then
      v_quantity := 1;

      if v_day_count >= 2 and v_event_date_id is null then
        raise exception 'INVENTORY_CONFLICT_409'
          using errcode = 'P0001';
      end if;

      if v_event_date_id is not null
         and not exists (
           select 1
           from public.event_schedules as s
           where s.id = v_event_date_id
             and s.event_id = p_event_id
         ) then
        raise exception 'INVENTORY_CONFLICT_409'
          using errcode = 'P0001';
      end if;

      if v_seat_id is not null
         and not exists (
           select 1
           from public.event_seating_units as u
           where u.id = v_seat_id
             and u.event_id = p_event_id
             and public.seating_unit_matches_requested_day(
               u.event_date_id,
               v_event_date_id,
               v_day_count
             )
             and (
               v_element_id is null
               or u.layout_item_id is null
               or u.layout_item_id = v_element_id
             )
         ) then
        v_seat_id := null;
      end if;

      if v_seat_id is null and v_element_id is not null then
        select u.id
          into v_resolved
        from public.event_seating_units as u
        where u.event_id = p_event_id
          and u.layout_item_id = v_element_id
          and public.seating_unit_matches_requested_day(
            u.event_date_id,
            v_event_date_id,
            v_day_count
          )
        order by
          case when u.event_date_id is not distinct from v_event_date_id then 0 else 1 end,
          u.id
        limit 1;
        if v_resolved is null then
          raise exception 'INVENTORY_CONFLICT_409'
            using errcode = 'P0001';
        end if;
        v_seat_id := v_resolved;
      end if;

      if v_seat_id is null then
        raise exception 'INVENTORY_CONFLICT_409'
          using errcode = 'P0001';
      end if;
    end if;

    if v_tier_id is null or v_quantity <= 0 then
      raise exception 'Cada item requiere ticket_tier_id y quantity > 0'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.ticket_tiers as tt
      where tt.id = v_tier_id
        and tt.event_id = p_event_id
        and tt.layout_type in ('numbered_seat', 'table_combo')
    ) and v_seat_id is null then
      raise exception 'SEAT_SELECTION_REQUIRED' using errcode = 'P0001';
    end if;

    v_out := v_out || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'type', v_type,
          'ticket_tier_id', v_tier_id,
          'tier_id', v_tier_id,
          'quantity', v_quantity,
          'seating_unit_id', v_seat_id,
          'seat_id', v_seat_id,
          'element_id', v_element_id,
          'event_date_id', v_event_date_id,
          'sector_key', nullif(btrim(coalesce(v_item ->> 'sector_key', '')), ''),
          'table_number', nullif(v_item ->> 'table_number', '')::integer,
          'zone_id', nullif(v_item ->> 'zone_id', '')::uuid,
          'phase_id', nullif(v_item ->> 'phase_id', '')::uuid
        )
      )
    );
  end loop;

  return v_out;
end;
$$;

comment on function public.normalize_checkout_cart_items(uuid, jsonb) is
  'Normaliza items general/mapped. Jornada via seating_unit_matches_requested_day. Numbered/mesa require a seating unit.';
