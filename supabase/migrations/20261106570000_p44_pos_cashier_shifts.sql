-- =============================================================================
-- P44: POS — turnos de caja, card_pos, DNI en venta presencial
-- =============================================================================

-- 1) Método de pago Posnet
alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (
    payment_method in (
      'mercadopago',
      'cash_pos',
      'transfer_pos',
      'card_pos'
    )
  );

comment on column public.orders.payment_method is
  'mercadopago | cash_pos | transfer_pos | card_pos (Posnet presencial)';

-- 2) Turnos de caja
create table if not exists public.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  cashier_id uuid not null references public.profiles (id) on delete cascade,
  start_amount numeric(12, 2) not null default 0
    check (start_amount >= 0),
  end_amount_expected numeric(12, 2),
  end_amount_counted numeric(12, 2),
  cash_sales_total numeric(12, 2) not null default 0,
  card_sales_total numeric(12, 2) not null default 0,
  transfer_sales_total numeric(12, 2) not null default 0,
  tickets_sold integer not null default 0,
  status text not null default 'open'
    check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cashier_shifts_one_open_per_cashier_event
  on public.cashier_shifts (event_id, cashier_id)
  where status = 'open';

create index if not exists cashier_shifts_cashier_opened_idx
  on public.cashier_shifts (cashier_id, opened_at desc);

create index if not exists cashier_shifts_event_status_idx
  on public.cashier_shifts (event_id, status);

comment on table public.cashier_shifts is
  'Turnos de boletería: apertura con fondo, ventas POS y arqueo al cerrar.';

alter table public.orders
  add column if not exists cashier_shift_id uuid
    references public.cashier_shifts (id) on delete set null;

create index if not exists orders_cashier_shift_id_idx
  on public.orders (cashier_shift_id)
  where cashier_shift_id is not null;

alter table public.cashier_shifts enable row level security;

drop policy if exists cashier_shifts_select_own on public.cashier_shifts;
create policy cashier_shifts_select_own
  on public.cashier_shifts
  for select
  to authenticated
  using (
    cashier_id = auth.uid()
    or public.user_is_event_organizer_or_staff(
      event_id,
      auth.uid(),
      array['cashier'::public.event_staff_role]
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists cashier_shifts_insert_own on public.cashier_shifts;
create policy cashier_shifts_insert_own
  on public.cashier_shifts
  for insert
  to authenticated
  with check (cashier_id = auth.uid());

drop policy if exists cashier_shifts_update_own on public.cashier_shifts;
create policy cashier_shifts_update_own
  on public.cashier_shifts
  for update
  to authenticated
  using (
    cashier_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

grant select, insert, update on public.cashier_shifts to authenticated;
grant all on public.cashier_shifts to service_role;

-- 3) Abrir turno
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

  if not public.user_is_event_organizer_or_staff(
    p_event_id,
    v_uid,
    array['cashier'::public.event_staff_role]
  ) then
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

-- 4) Cerrar turno / arqueo
create or replace function public.close_cashier_shift(
  p_shift_id uuid,
  p_counted_amount numeric default null
)
returns public.cashier_shifts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.cashier_shifts;
  v_cash numeric(12, 2);
  v_card numeric(12, 2);
  v_transfer numeric(12, 2);
  v_tickets integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_row
  from public.cashier_shifts s
  where s.id = p_shift_id
  for update of s;

  if not found then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_row.cashier_id is distinct from v_uid
     and not exists (
       select 1 from public.profiles p
       where p.id = v_uid and p.role = 'super_admin'
     ) then
    raise exception 'FORBIDDEN_SHIFT' using errcode = '42501';
  end if;

  if v_row.status <> 'open' then
    raise exception 'SHIFT_ALREADY_CLOSED' using errcode = '23514';
  end if;

  select
    coalesce(sum(case when o.payment_method = 'cash_pos' then o.total_amount else 0 end), 0),
    coalesce(sum(case when o.payment_method = 'card_pos' then o.total_amount else 0 end), 0),
    coalesce(sum(case when o.payment_method = 'transfer_pos' then o.total_amount else 0 end), 0),
    coalesce((
      select count(*)::integer
      from public.tickets t
      join public.orders ox on ox.id = t.order_id
      where ox.cashier_shift_id = v_row.id
        and t.status::text in ('valid', 'used', 'scanned')
    ), 0)
    into v_cash, v_card, v_transfer, v_tickets
  from public.orders o
  where o.cashier_shift_id = v_row.id
    and o.status = 'paid';

  update public.cashier_shifts
  set
    cash_sales_total = v_cash,
    card_sales_total = v_card,
    transfer_sales_total = v_transfer,
    tickets_sold = v_tickets,
    end_amount_expected = v_row.start_amount + v_cash,
    end_amount_counted = p_counted_amount,
    status = 'closed',
    closed_at = now(),
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.close_cashier_shift(uuid, numeric) from public;
grant execute on function public.close_cashier_shift(uuid, numeric)
  to authenticated, service_role;

-- 5) create_pos_sale_tx — DNI, card_pos, turno obligatorio
drop function if exists public.create_pos_sale_tx(uuid, uuid, integer, text, uuid, text);

create or replace function public.create_pos_sale_tx(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_staff_id uuid,
  p_customer_phone text default null,
  p_customer_dni text default null,
  p_customer_name text default null,
  p_shift_id uuid default null
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
  v_order_id uuid;
  v_subtotal numeric(12, 2);
  v_service_charge numeric(12, 2);
  v_method text;
  v_phone text;
  v_dni text;
  v_name text;
  v_i integer;
  v_ticket_id uuid;
  v_secret text;
  v_qr text;
  v_is_dynamic boolean;
  v_rate numeric(5, 4) := 0.15;
  v_shift public.cashier_shifts%rowtype;
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

  -- Turno abierto obligatorio
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
    tt.sold
    into v_tier_event, v_price, v_unit_fee, v_capacity, v_sold
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found then
    raise exception 'TIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tier_event is distinct from p_event_id then
    raise exception 'TIER_EVENT_MISMATCH' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ticket_tiers as tt
    where tt.id = p_tier_id
      and (
        lower(tt.name) like '%freepass%'
        or lower(tt.name) like '%cortes%'
      )
  ) then
    raise exception 'TIER_NOT_ALLOWED_POS' using errcode = '23514';
  end if;

  if (v_capacity - v_sold) < p_quantity then
    raise exception 'Sold out' using errcode = 'P0001';
  end if;

  update public.ticket_tiers
  set sold = sold + p_quantity
  where id = p_tier_id;

  v_subtotal := round(v_price * p_quantity, 2);
  v_service_charge := round(v_unit_fee * p_quantity, 2);
  v_phone := nullif(btrim(coalesce(p_customer_phone, '')), '');
  -- Entradas de boletería física: QR fijo (papel / pantalla POS)
  v_is_dynamic := false;

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
    v_service_charge,
    v_subtotal,
    'paid',
    v_method,
    v_phone,
    v_shift.id
  )
  returning id into v_order_id;

  for v_i in 1..p_quantity loop
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
      holder_dni
    )
    values (
      p_event_id,
      p_tier_id,
      p_staff_id,
      v_qr,
      'valid'::public.ticket_status,
      v_order_id,
      v_is_dynamic,
      v_secret,
      v_name,
      v_dni
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

  update public.cashier_shifts
  set
    cash_sales_total = cash_sales_total
      + case when v_method = 'cash_pos' then v_subtotal else 0 end,
    card_sales_total = card_sales_total
      + case when v_method = 'card_pos' then v_subtotal else 0 end,
    transfer_sales_total = transfer_sales_total
      + case when v_method = 'transfer_pos' then v_subtotal else 0 end,
    tickets_sold = tickets_sold + p_quantity,
    updated_at = now()
  where id = v_shift.id;
end;
$$;

revoke all on function public.create_pos_sale_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid
) from public;
grant execute on function public.create_pos_sale_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid
) to authenticated, service_role;
