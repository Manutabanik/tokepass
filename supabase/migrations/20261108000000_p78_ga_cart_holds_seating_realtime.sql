-- P78: GA cart holds (server-side stock lock) + public seating occupancy realtime.

-- -----------------------------------------------------------------------------
-- 1) Shared TTL (10 minutes) — single source for cart holds
-- -----------------------------------------------------------------------------
create or replace function public.checkout_hold_until()
returns timestamptz
language sql
stable
set search_path = pg_catalog, public
as $$
  select clock_timestamp() + interval '10 minutes';
$$;

revoke all on function public.checkout_hold_until() from public;
grant execute on function public.checkout_hold_until() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) event_ga_cart_holds
-- -----------------------------------------------------------------------------
create table if not exists public.event_ga_cart_holds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  owner_id uuid not null,
  quantity integer not null check (quantity >= 1),
  reserved_until timestamptz not null,
  created_at timestamptz not null default now(),
  constraint event_ga_cart_holds_owner_tier_key unique (event_id, owner_id, tier_id)
);

create index if not exists event_ga_cart_holds_expiry_idx
  on public.event_ga_cart_holds (reserved_until);

create index if not exists event_ga_cart_holds_tier_idx
  on public.event_ga_cart_holds (tier_id, reserved_until);

alter table public.event_ga_cart_holds enable row level security;

revoke all on table public.event_ga_cart_holds from public, anon;
grant select on table public.event_ga_cart_holds to authenticated;
grant all on table public.event_ga_cart_holds to service_role;

drop policy if exists event_ga_cart_holds_select_own on public.event_ga_cart_holds;
create policy event_ga_cart_holds_select_own
  on public.event_ga_cart_holds
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 3) Hold / release / claim / expire
-- -----------------------------------------------------------------------------
create or replace function public.hold_ga_tickets_for_cart(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb
)
returns table (reserved_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_tier_id uuid;
  v_qty integer;
  v_prev integer;
  v_delta integer;
  v_tier public.ticket_tiers%rowtype;
  v_until timestamptz := public.checkout_hold_until();
  v_min timestamptz := v_until;
  v_keep uuid[] := '{}';
  v_held boolean := false;
  v_stale public.event_ga_cart_holds%rowtype;
begin
  perform set_config('lock_timeout', '4s', true);

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.event_is_buyable(p_event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_tier_id := nullif(v_item->>'tier_id', '')::uuid;
    v_qty := greatest(0, coalesce((v_item->>'quantity')::integer, 0));
    if v_tier_id is null or v_qty < 1 then
      continue;
    end if;

    select *
      into v_tier
    from public.ticket_tiers as tt
    where tt.id = v_tier_id
      and tt.event_id = p_event_id
    for update of tt;

    if not found then
      raise exception 'Ticket tier no encontrado'
        using errcode = 'P0002';
    end if;

    select coalesce(h.quantity, 0)
      into v_prev
    from public.event_ga_cart_holds as h
    where h.event_id = p_event_id
      and h.owner_id = p_owner_id
      and h.tier_id = v_tier_id;

    v_delta := v_qty - coalesce(v_prev, 0);

    if v_delta > 0
       and (coalesce(v_tier.total_capacity, v_tier.capacity) - v_tier.sold) < v_delta then
      raise exception 'Capacidad del ticket insuficiente'
        using errcode = 'P0001';
    end if;

    if v_delta <> 0 then
      update public.ticket_tiers
      set sold = greatest(0, sold + v_delta)
      where id = v_tier_id;
    end if;

    insert into public.event_ga_cart_holds (
      event_id,
      tier_id,
      owner_id,
      quantity,
      reserved_until
    )
    values (
      p_event_id,
      v_tier_id,
      p_owner_id,
      v_qty,
      v_until
    )
    on conflict (event_id, owner_id, tier_id)
    do update set
      quantity = excluded.quantity,
      reserved_until = excluded.reserved_until;

    v_keep := array_append(v_keep, v_tier_id);
    v_held := true;
    if v_until < v_min then
      v_min := v_until;
    end if;
  end loop;

  if not v_held then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  for v_stale in
    select *
    from public.event_ga_cart_holds as h
    where h.event_id = p_event_id
      and h.owner_id = p_owner_id
      and not (h.tier_id = any (v_keep))
    for update
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_stale.quantity)
    where id = v_stale.tier_id;

    delete from public.event_ga_cart_holds where id = v_stale.id;
  end loop;

  reserved_until := v_min;
  return next;
end;
$$;

create or replace function public.release_ga_cart_holds(
  p_event_id uuid,
  p_owner_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.event_ga_cart_holds%rowtype;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_row in
    select *
    from public.event_ga_cart_holds
    where event_id = p_event_id
      and owner_id = p_owner_id
    for update
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_row.quantity)
    where id = v_row.tier_id;

    delete from public.event_ga_cart_holds where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.get_ga_cart_hold(
  p_event_id uuid,
  p_owner_id uuid
)
returns table (reserved_until timestamptz, quantity integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
    select min(h.reserved_until), coalesce(sum(h.quantity), 0)::integer
    from public.event_ga_cart_holds as h
    where h.event_id = p_event_id
      and h.owner_id = p_owner_id
      and h.reserved_until > clock_timestamp();
end;
$$;

-- Converts a cart hold into a pending order: drop the hold row but keep sold
-- (reserve_tickets_* will increment sold for the issued tickets).
create or replace function public.claim_ga_cart_holds_for_checkout(
  p_event_id uuid,
  p_owner_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.event_ga_cart_holds%rowtype;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_row in
    select *
    from public.event_ga_cart_holds
    where event_id = p_event_id
      and owner_id = p_owner_id
    for update
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_row.quantity)
    where id = v_row.tier_id;

    delete from public.event_ga_cart_holds where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.expire_ga_cart_holds()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.event_ga_cart_holds%rowtype;
  v_count integer := 0;
begin
  for v_row in
    select *
    from public.event_ga_cart_holds
    where reserved_until <= clock_timestamp()
    order by reserved_until asc
    limit 2500
    for update skip locked
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_row.quantity)
    where id = v_row.tier_id;

    delete from public.event_ga_cart_holds where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.hold_ga_tickets_for_cart(uuid, uuid, jsonb) from public, anon;
grant execute on function public.hold_ga_tickets_for_cart(uuid, uuid, jsonb)
  to authenticated, service_role;

revoke all on function public.release_ga_cart_holds(uuid, uuid) from public, anon;
grant execute on function public.release_ga_cart_holds(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.get_ga_cart_hold(uuid, uuid) from public, anon;
grant execute on function public.get_ga_cart_hold(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.claim_ga_cart_holds_for_checkout(uuid, uuid) from public, anon;
grant execute on function public.claim_ga_cart_holds_for_checkout(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.expire_ga_cart_holds() from public;
grant execute on function public.expire_ga_cart_holds() to service_role;

-- -----------------------------------------------------------------------------
-- 4) Seating cart hold TTL = 10 minutes
-- -----------------------------------------------------------------------------
create or replace function public.hold_seating_unit_for_cart(
  p_event_id uuid,
  p_owner_id uuid,
  p_seating_unit_id uuid
)
returns table (seating_unit_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_hold_until timestamptz := public.checkout_hold_until();
begin
  perform set_config('lock_timeout', '4s', true);

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.event_is_buyable(p_event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  update public.event_seating_units
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  where event_id = p_event_id
    and reserved_by = p_owner_id
    and status = 'reserved'
    and reserved_order_id is null
    and id is distinct from p_seating_unit_id;

  select *
    into v_unit
  from public.event_seating_units as u
  where u.id = p_seating_unit_id
    and u.event_id = p_event_id;

  if not found then
    raise exception 'Ubicación no encontrada'
      using errcode = 'P0002';
  end if;

  if v_unit.status = 'reserved'
     and v_unit.reserved_until <= now()
     and v_unit.reserved_order_id is not null then
    perform public.expire_seating_order(v_unit.reserved_order_id);
  elsif v_unit.status = 'reserved'
     and v_unit.reserved_until <= now()
     and v_unit.reserved_order_id is null then
    perform public.expire_seating_cart_hold(v_unit.id);
  end if;

  begin
    select * into v_unit
    from public.event_seating_units
    where id = p_seating_unit_id
      and event_id = p_event_id
    for update;
  exception
    when lock_not_available then
      raise exception 'SEATING_UNIT_UNAVAILABLE'
        using errcode = 'P0001';
  end;

  if public.seating_unit_is_owner_cart_hold(
    v_unit.status,
    v_unit.reserved_by,
    v_unit.reserved_until,
    v_unit.reserved_order_id,
    p_owner_id
  ) then
    seating_unit_id := v_unit.id;
    reserved_until := v_unit.reserved_until;
    return next;
    return;
  end if;

  if v_unit.status <> 'available' then
    raise exception 'SEATING_UNIT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  update public.event_seating_units
  set
    status = 'reserved',
    reserved_by = p_owner_id,
    reserved_order_id = null,
    reserved_until = v_hold_until,
    updated_at = now()
  where id = p_seating_unit_id
    and status = 'available';

  if not found then
    raise exception 'SEATING_UNIT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  seating_unit_id := p_seating_unit_id;
  reserved_until := v_hold_until;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Public occupancy read + realtime
-- -----------------------------------------------------------------------------
grant select on public.event_seating_units to anon, authenticated;

drop policy if exists event_seating_units_public_occupancy
  on public.event_seating_units;
create policy event_seating_units_public_occupancy
  on public.event_seating_units
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.events as e
      where e.id = event_seating_units.event_id
        and e.status = 'published'
        and e.visibility = 'public'
    )
  );

alter table public.event_seating_units replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_seating_units'
  ) then
    alter publication supabase_realtime add table public.event_seating_units;
  end if;
end $$;
