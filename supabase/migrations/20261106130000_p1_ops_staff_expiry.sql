-- =============================================================================
-- P1: order TTL expiry, event staff roles, guest-list rate limit + claim bind
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Orders: allow `expired` status
-- -----------------------------------------------------------------------------
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'failed', 'expired'));

-- -----------------------------------------------------------------------------
-- 2) Expire abandoned pending orders (30m) — atomic stock restore
-- -----------------------------------------------------------------------------
create or replace function public.expire_abandoned_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_tier_id uuid;
  v_count integer;
begin
  if p_order_id is null then
    return false;
  end if;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return false;
  end if;

  if v_order.status is distinct from 'pending' then
    return false;
  end if;

  for v_tier_id, v_count in
    select t.tier_id, count(*)::integer
    from public.tickets as t
    where t.order_id = p_order_id
      and t.status = 'pending_payment'::public.ticket_status
    group by t.tier_id
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_count)
    where id = v_tier_id;
  end loop;

  update public.tickets
  set
    status = 'cancelled'::public.ticket_status,
    updated_at = now()
  where order_id = p_order_id
    and status = 'pending_payment'::public.ticket_status;

  -- Best-effort: release unpaid add-ons if function exists.
  begin
    perform public.release_order_event_items(p_order_id);
  exception
    when undefined_function then
      null;
  end;

  update public.orders
  set
    status = 'expired',
    updated_at = now()
  where id = p_order_id
    and status = 'pending';

  return true;
end;
$$;

revoke all on function public.expire_abandoned_order(uuid) from public;
revoke all on function public.expire_abandoned_order(uuid) from anon, authenticated;
grant execute on function public.expire_abandoned_order(uuid) to service_role;

create or replace function public.expire_abandoned_orders(
  p_older_than interval default interval '30 minutes'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_order_id in
    select o.id
    from public.orders as o
    where o.status = 'pending'
      and o.created_at < (now() - p_older_than)
    order by o.created_at asc
    limit 500
    for update skip locked
  loop
    if public.expire_abandoned_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_abandoned_orders(interval) from public;
revoke all on function public.expire_abandoned_orders(interval) from anon, authenticated;
grant execute on function public.expire_abandoned_orders(interval) to service_role;

-- -----------------------------------------------------------------------------
-- 3) Event staff assignments (door / bar / cashier)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'event_staff_role'
  ) then
    create type public.event_staff_role as enum (
      'door_staff',
      'bar_staff',
      'cashier'
    );
  end if;
end $$;

create table if not exists public.event_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.event_staff_role not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, user_id, role)
);

create index if not exists event_staff_assignments_event_idx
  on public.event_staff_assignments (event_id);

create index if not exists event_staff_assignments_user_idx
  on public.event_staff_assignments (user_id);

alter table public.event_staff_assignments enable row level security;

revoke all on public.event_staff_assignments from public, anon;
grant select, insert, update, delete on public.event_staff_assignments
  to authenticated;
grant all on public.event_staff_assignments to service_role;

create or replace function public.user_has_event_staff_role(
  p_event_id uuid,
  p_user_id uuid,
  p_role public.event_staff_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_staff_assignments as esa
    where esa.event_id = p_event_id
      and esa.user_id = p_user_id
      and esa.role = p_role
  );
$$;

revoke all on function public.user_has_event_staff_role(uuid, uuid, public.event_staff_role)
  from public;
grant execute on function public.user_has_event_staff_role(uuid, uuid, public.event_staff_role)
  to authenticated, service_role;

create or replace function public.user_is_event_organizer_or_staff(
  p_event_id uuid,
  p_user_id uuid,
  p_roles public.event_staff_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.events as e
      where e.id = p_event_id
        and e.organizer_id = p_user_id
    )
    or exists (
      select 1
      from public.event_staff_assignments as esa
      where esa.event_id = p_event_id
        and esa.user_id = p_user_id
        and (
          p_roles is null
          or esa.role = any (p_roles)
        )
    );
$$;

revoke all on function public.user_is_event_organizer_or_staff(uuid, uuid, public.event_staff_role[])
  from public;
grant execute on function public.user_is_event_organizer_or_staff(uuid, uuid, public.event_staff_role[])
  to authenticated, service_role;

drop policy if exists event_staff_select_own_or_organizer on public.event_staff_assignments;
create policy event_staff_select_own_or_organizer
on public.event_staff_assignments
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.events as e
    where e.id = event_id
      and e.organizer_id = (select auth.uid())
  )
  or public.is_super_admin()
);

drop policy if exists event_staff_insert_organizer on public.event_staff_assignments;
create policy event_staff_insert_organizer
on public.event_staff_assignments
for insert
to authenticated
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.events as e
    where e.id = event_id
      and e.organizer_id = (select auth.uid())
  )
);

drop policy if exists event_staff_delete_organizer on public.event_staff_assignments;
create policy event_staff_delete_organizer
on public.event_staff_assignments
for delete
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.events as e
    where e.id = event_id
      and e.organizer_id = (select auth.uid())
  )
);

drop policy if exists event_staff_update_organizer on public.event_staff_assignments;
create policy event_staff_update_organizer
on public.event_staff_assignments
for update
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.events as e
    where e.id = event_id
      and e.organizer_id = (select auth.uid())
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.events as e
    where e.id = event_id
      and e.organizer_id = (select auth.uid())
  )
);

-- Staff can read assigned events (incl. drafts) for ops UIs.
drop policy if exists events_select_staff_assigned on public.events;
create policy events_select_staff_assigned
on public.events
for select
to authenticated
using (
  exists (
    select 1
    from public.event_staff_assignments as esa
    where esa.event_id = events.id
      and esa.user_id = (select auth.uid())
  )
);

-- Door staff: read/update tickets on assigned events (scan only).
drop policy if exists tickets_select_door_staff on public.tickets;
create policy tickets_select_door_staff
on public.tickets
for select
to authenticated
using (
  public.user_has_event_staff_role(
    event_id,
    (select auth.uid()),
    'door_staff'::public.event_staff_role
  )
);

drop policy if exists tickets_update_door_staff on public.tickets;
create policy tickets_update_door_staff
on public.tickets
for update
to authenticated
using (
  public.user_has_event_staff_role(
    event_id,
    (select auth.uid()),
    'door_staff'::public.event_staff_role
  )
)
with check (
  public.user_has_event_staff_role(
    event_id,
    (select auth.uid()),
    'door_staff'::public.event_staff_role
  )
);

-- Tiers readable by assigned staff (POS / scanner labels).
drop policy if exists ticket_tiers_select_staff on public.ticket_tiers;
create policy ticket_tiers_select_staff
on public.ticket_tiers
for select
to authenticated
using (
  exists (
    select 1
    from public.event_staff_assignments as esa
    where esa.event_id = ticket_tiers.event_id
      and esa.user_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- POS: allow cashier staff
-- -----------------------------------------------------------------------------
create or replace function public.create_pos_sale_tx(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_staff_id uuid,
  p_customer_phone text default null
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
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_price numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event uuid;
  v_order_id uuid;
  v_subtotal numeric(12, 2);
  v_method text;
  v_phone text;
  v_i integer;
  v_ticket_id uuid;
  v_secret text;
  v_qr text;
  v_is_dynamic boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_method := lower(btrim(coalesce(p_payment_method, '')));
  if v_method not in ('cash_pos', 'transfer_pos') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
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

  select tt.event_id, tt.price, tt.capacity, tt.sold
    into v_tier_event, v_price, v_capacity, v_sold
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
  v_phone := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_is_dynamic := coalesce(v_event.qr_type, 'dynamic') = 'dynamic';

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    payment_method,
    customer_phone
  )
  values (
    p_staff_id,
    v_subtotal,
    0,
    v_subtotal,
    'paid',
    v_method,
    v_phone
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
      totp_secret
    )
    values (
      p_event_id,
      p_tier_id,
      p_staff_id,
      v_qr,
      'valid'::public.ticket_status,
      v_order_id,
      v_is_dynamic,
      v_secret
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
end;
$$;

revoke all on function public.create_pos_sale_tx(uuid, uuid, integer, text, uuid, text)
  from public;
grant execute on function public.create_pos_sale_tx(uuid, uuid, integer, text, uuid, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Bar redeem: allow bar_staff
-- -----------------------------------------------------------------------------
create or replace function public.redeem_item(
  p_qr_token text,
  p_staff_user_id uuid
)
returns table (
  redemption_id uuid,
  item_name text,
  item_description text,
  redeemed_at timestamptz,
  already_redeemed boolean,
  previous_redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redemption public.item_redemptions%rowtype;
  v_item public.event_items%rowtype;
  v_organizer uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_user_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_redemption
  from public.item_redemptions
  where qr_code_token = btrim(p_qr_token)
  for update;

  if not found then
    raise exception 'Consumición no encontrada' using errcode = 'P0002';
  end if;

  select *
    into v_item
  from public.event_items
  where id = v_redemption.item_id;

  select e.organizer_id
    into v_organizer
  from public.events as e
  where e.id = v_item.event_id;

  if not public.user_is_event_organizer_or_staff(
    v_item.event_id,
    p_staff_user_id,
    array['bar_staff'::public.event_staff_role]
  ) then
    raise exception 'Sin permiso de barra para este evento'
      using errcode = '42501';
  end if;

  if v_redemption.status = 'redeemed' then
    return query
    select
      v_redemption.id,
      v_item.name,
      v_item.description,
      v_redemption.redeemed_at,
      true,
      v_redemption.redeemed_at;
    return;
  end if;

  if v_redemption.status = 'pending' then
    raise exception 'Consumición aún no pagada' using errcode = '23514';
  end if;

  if v_redemption.status = 'cancelled' then
    raise exception 'Consumición cancelada' using errcode = '23514';
  end if;

  if v_redemption.status <> 'valid' then
    raise exception 'Estado inválido' using errcode = '23514';
  end if;

  update public.item_redemptions
  set
    status = 'redeemed',
    redeemed_at = now(),
    redeemed_by = p_staff_user_id
  where id = v_redemption.id
  returning * into v_redemption;

  return query
  select
    v_redemption.id,
    v_item.name,
    v_item.description,
    v_redemption.redeemed_at,
    false,
    null::timestamptz;
end;
$$;

revoke all on function public.redeem_item(text, uuid) from public;
grant execute on function public.redeem_item(text, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) Internal rate limiting + guest claim email binding
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  hit_count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from public, anon, authenticated;
grant all on public.rate_limit_buckets to service_role;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.rate_limit_buckets%rowtype;
  v_now timestamptz := now();
begin
  if p_bucket_key is null or length(btrim(p_bucket_key)) = 0 then
    return false;
  end if;

  insert into public.rate_limit_buckets (bucket_key, hit_count, window_start)
  values (p_bucket_key, 1, v_now)
  on conflict (bucket_key) do nothing;

  select *
    into v_row
  from public.rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if v_row.window_start + make_interval(secs => greatest(p_window_seconds, 1)) < v_now then
    update public.rate_limit_buckets
    set hit_count = 1, window_start = v_now
    where bucket_key = p_bucket_key;
    return true;
  end if;

  if v_row.hit_count >= p_limit then
    return false;
  end if;

  update public.rate_limit_buckets
  set hit_count = hit_count + 1
  where bucket_key = p_bucket_key;

  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to anon, authenticated, service_role;

-- Claim FreePass: require profile email == entry email
create or replace function public.claim_guest_list_entry(
  p_entry_id uuid,
  p_owner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.guest_list_entries%rowtype;
  v_list public.guest_lists%rowtype;
  v_tier_id uuid;
  v_ticket_id uuid;
  v_profile_email text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_entry
  from public.guest_list_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Entrada no encontrada' using errcode = 'P0002';
  end if;

  if v_entry.status = 'checked_in' then
    raise exception 'Esta cortesía ya fue usada en puerta' using errcode = '23514';
  end if;

  if v_entry.status = 'claimed' and v_entry.ticket_id is not null then
    return v_entry.ticket_id;
  end if;

  if v_entry.status <> 'pending' then
    raise exception 'La entrada no está disponible para canje' using errcode = '23514';
  end if;

  if v_entry.email is null or btrim(v_entry.email) = '' then
    raise exception 'EMAIL_REQUIRED_FOR_CLAIM' using errcode = '23514';
  end if;

  select lower(p.email)
    into v_profile_email
  from public.profiles as p
  where p.id = p_owner_id;

  if v_profile_email is null
     or v_profile_email <> lower(btrim(v_entry.email)) then
    raise exception 'EMAIL_MISMATCH_FOR_CLAIM' using errcode = '23514';
  end if;

  select *
    into v_list
  from public.guest_lists
  where id = v_entry.guest_list_id
  for update;

  if v_list.valid_until < now() then
    raise exception 'El horario de esta lista ya venció' using errcode = '23514';
  end if;

  v_tier_id := public.ensure_freepass_tier(v_list.event_id);

  update public.ticket_tiers
  set sold = sold + 1
  where id = v_tier_id
    and sold < capacity;

  if not found then
    update public.ticket_tiers
    set
      capacity = capacity + 1000,
      sold = sold + 1
    where id = v_tier_id;
  end if;

  insert into public.tickets (
    event_id,
    tier_id,
    owner_id,
    qr_code,
    status,
    is_dynamic_qr
  )
  values (
    v_list.event_id,
    v_tier_id,
    p_owner_id,
    'freepass-' || replace(gen_random_uuid()::text, '-', ''),
    'valid'::public.ticket_status,
    true
  )
  returning id into v_ticket_id;

  update public.guest_list_entries
  set
    status = 'claimed',
    ticket_id = v_ticket_id
  where id = p_entry_id;

  return v_ticket_id;
end;
$$;

revoke all on function public.claim_guest_list_entry(uuid, uuid) from public;
grant execute on function public.claim_guest_list_entry(uuid, uuid)
  to authenticated, service_role;

-- Require email on public registration
create or replace function public.register_guest_list_entry(
  p_list_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.guest_lists%rowtype;
  v_entry_id uuid;
  v_email text;
begin
  select *
    into v_list
  from public.guest_lists
  where id = p_list_id
  for update;

  if not found then
    raise exception 'Lista no encontrada' using errcode = 'P0002';
  end if;

  if v_list.valid_until < now() then
    raise exception 'El horario de esta lista ya venció' using errcode = '23514';
  end if;

  if v_list.used_guests >= v_list.max_guests then
    raise exception 'Lista completa' using errcode = 'P0001';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) < 2 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_REQUIRED' using errcode = '22023';
  end if;

  update public.guest_lists
  set used_guests = used_guests + 1
  where id = p_list_id
    and used_guests < max_guests;

  if not found then
    raise exception 'Lista completa' using errcode = 'P0001';
  end if;

  insert into public.guest_list_entries (
    guest_list_id,
    full_name,
    email,
    phone,
    status
  )
  values (
    p_list_id,
    btrim(p_full_name),
    v_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    'pending'
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

revoke all on function public.register_guest_list_entry(uuid, text, text, text) from public;
grant execute on function public.register_guest_list_entry(uuid, text, text, text)
  to anon, authenticated, service_role;
