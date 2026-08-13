-- =============================================================================
-- P47: POS supervisor PIN, void_pos_order, cortesía con autorización
-- =============================================================================

alter table public.events
  add column if not exists pos_supervisor_pin_hash text;

comment on column public.events.pos_supervisor_pin_hash is
  'SHA-256 hex del PIN de supervisor para cortesías / anulaciones POS.';

create or replace function public.hash_pos_supervisor_pin(p_pin text)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(convert_to(btrim(coalesce(p_pin, '')), 'UTF8'), 'sha256'),
    'hex'
  );
$$;

revoke all on function public.hash_pos_supervisor_pin(text) from public;
grant execute on function public.hash_pos_supervisor_pin(text)
  to authenticated, service_role;

create or replace function public.verify_pos_supervisor_pin(
  p_event_id uuid,
  p_pin text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_hash text;
  v_uid uuid := auth.uid();
begin
  if p_pin is null or length(btrim(p_pin)) < 4 then
    return false;
  end if;

  select e.pos_supervisor_pin_hash
    into v_hash
  from public.events e
  where e.id = p_event_id;

  if v_hash is null or btrim(v_hash) = '' then
    -- Sin PIN configurado: organizador / admin / super_admin pueden autorizar
    -- enviando el PIN especial "ORG" solo si son dueños del evento.
    if upper(btrim(p_pin)) = 'ORG' and v_uid is not null then
      return exists (
        select 1
        from public.events e
        join public.profiles p on p.id = v_uid
        where e.id = p_event_id
          and (
            e.organizer_id = v_uid
            or p.role in ('admin', 'super_admin')
          )
      );
    end if;
    return false;
  end if;

  return v_hash = public.hash_pos_supervisor_pin(p_pin);
end;
$$;

revoke all on function public.verify_pos_supervisor_pin(uuid, text) from public;
grant execute on function public.verify_pos_supervisor_pin(uuid, text)
  to authenticated, service_role;

create or replace function public.set_pos_supervisor_pin(
  p_event_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_pin is null or length(btrim(p_pin)) < 4 or length(btrim(p_pin)) > 12 then
    raise exception 'PIN_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.events e
    join public.profiles p on p.id = v_uid
    where e.id = p_event_id
      and (
        e.organizer_id = v_uid
        or p.role in ('admin', 'super_admin')
      )
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.events
  set
    pos_supervisor_pin_hash = public.hash_pos_supervisor_pin(p_pin),
    updated_at = now()
  where id = p_event_id;

  return true;
end;
$$;

revoke all on function public.set_pos_supervisor_pin(uuid, text) from public;
grant execute on function public.set_pos_supervisor_pin(uuid, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- create_pos_sale_tx — cortesía / $0 con PIN; mantiene QR estático POS
-- -----------------------------------------------------------------------------
drop function if exists public.create_pos_sale_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid
);

create or replace function public.create_pos_sale_tx(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_staff_id uuid,
  p_customer_phone text default null,
  p_customer_dni text default null,
  p_customer_name text default null,
  p_shift_id uuid default null,
  p_supervisor_pin text default null
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
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_method := lower(btrim(coalesce(p_payment_method, '')));
  if v_method not in ('cash_pos', 'transfer_pos', 'card_pos') then
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

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.user_is_event_organizer_or_staff(
    p_event_id,
    p_staff_id,
    array['cashier'::public.event_staff_role]
  ) then
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
      and s.cashier_id = p_staff_id
      and s.status = 'open'
    for update of s
    limit 1;
  end if;

  if not found then
    raise exception 'SHIFT_REQUIRED' using errcode = 'P0001';
  end if;

  if v_shift.status <> 'open'
     or v_shift.event_id is distinct from p_event_id
     or v_shift.cashier_id is distinct from p_staff_id then
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
    tt.name
    into v_tier_event, v_price, v_unit_fee, v_capacity, v_sold, v_admit, v_tier_name
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found then
    raise exception 'TIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tier_event is distinct from p_event_id then
    raise exception 'TIER_EVENT_MISMATCH' using errcode = '23514';
  end if;

  v_needs_pin :=
    coalesce(v_price, 0) <= 0
    or lower(coalesce(v_tier_name, '')) like '%freepass%'
    or lower(coalesce(v_tier_name, '')) like '%cortes%';

  if v_needs_pin then
    if not public.verify_pos_supervisor_pin(p_event_id, p_supervisor_pin) then
      raise exception 'SUPERVISOR_PIN_REQUIRED' using errcode = '42501';
    end if;
    -- Cortesías: fee 0
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
    cashier_shift_id
  )
  values (
    p_staff_id,
    v_subtotal,
    round(v_unit_fee * p_quantity, 2),
    v_subtotal,
    'paid',
    v_method,
    v_phone,
    v_shift.id
  )
  returning id into v_order_id;

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
        admissions_used
      )
      values (
        p_event_id,
        p_tier_id,
        p_staff_id,
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
        0
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

    perform public.fulfill_tier_combo_items(
      v_order_id,
      p_tier_id,
      p_staff_id,
      'valid'
    );
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

revoke all on function public.create_pos_sale_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text
) from public;
grant execute on function public.create_pos_sale_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- void_pos_order — anulación con PIN; revierte turno y stock
-- -----------------------------------------------------------------------------
create or replace function public.void_pos_order(
  p_order_id uuid,
  p_supervisor_pin text
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_shift public.cashier_shifts%rowtype;
  v_event_id uuid;
  v_ticket_count integer;
  v_used_count integer;
  v_tier_id uuid;
  v_admit integer;
  v_units integer;
  v_tier_tickets integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_order
  from public.orders o
  where o.id = p_order_id
  for update of o;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'ORDER_NOT_VOIDABLE' using errcode = '23514';
  end if;

  if v_order.payment_method::text not in ('cash_pos', 'card_pos', 'transfer_pos') then
    raise exception 'NOT_POS_ORDER' using errcode = '23514';
  end if;

  if v_order.cashier_shift_id is null then
    raise exception 'SHIFT_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_shift
  from public.cashier_shifts s
  where s.id = v_order.cashier_shift_id
  for update of s;

  if not found or v_shift.status <> 'open' then
    raise exception 'SHIFT_INVALID' using errcode = '23514';
  end if;

  select t.event_id into v_event_id
  from public.tickets t
  where t.order_id = v_order.id
  limit 1;

  if v_event_id is null then
    raise exception 'ORDER_EMPTY' using errcode = 'P0002';
  end if;

  if not public.user_is_event_organizer_or_staff(
    v_event_id,
    v_uid,
    array['cashier'::public.event_staff_role]
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not public.verify_pos_supervisor_pin(v_event_id, p_supervisor_pin) then
    raise exception 'SUPERVISOR_PIN_REQUIRED' using errcode = '42501';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where t.status::text in ('used', 'scanned')
         or coalesce(t.admissions_used, 0) > 0
    )::integer
    into v_ticket_count, v_used_count
  from public.tickets t
  where t.order_id = v_order.id;

  if coalesce(v_used_count, 0) > 0 then
    raise exception 'VOID_TICKETS_USED' using errcode = '23514';
  end if;

  update public.tickets
  set
    status = 'cancelled'::public.ticket_status,
    updated_at = now()
  where order_id = v_order.id
    and status = 'valid'::public.ticket_status;

  for v_tier_id, v_tier_tickets in
    select t.tier_id, count(*)::integer
    from public.tickets t
    where t.order_id = v_order.id
    group by t.tier_id
  loop
    select greatest(1, least(50, coalesce(tt.admit_count, 1)))
      into v_admit
    from public.ticket_tiers tt
    where tt.id = v_tier_id;

    v_units := greatest(1, (v_tier_tickets / greatest(v_admit, 1)));

    update public.ticket_tiers
    set sold = greatest(0, sold - v_units)
    where id = v_tier_id;
  end loop;

  update public.cashier_shifts
  set
    cash_sales_total = greatest(
      0,
      cash_sales_total
        - case
            when v_order.payment_method::text = 'cash_pos'
              then v_order.total_amount
            else 0
          end
    ),
    card_sales_total = greatest(
      0,
      card_sales_total
        - case
            when v_order.payment_method::text = 'card_pos'
              then v_order.total_amount
            else 0
          end
    ),
    transfer_sales_total = greatest(
      0,
      transfer_sales_total
        - case
            when v_order.payment_method::text = 'transfer_pos'
              then v_order.total_amount
            else 0
          end
    ),
    tickets_sold = greatest(0, tickets_sold - coalesce(v_ticket_count, 0)),
    updated_at = now()
  where id = v_shift.id;

  update public.orders
  set
    status = 'refunded',
    updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.void_pos_order(uuid, text) from public;
grant execute on function public.void_pos_order(uuid, text)
  to authenticated, service_role;
