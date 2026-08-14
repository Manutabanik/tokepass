-- P66: Cart seating hold (8m) before payment.
-- Numbered units can be reserved for the buyer without creating an order yet.
-- reserved_order_id stays null until reserve_*_tx attaches the pending order.

alter table public.event_seating_units
  drop constraint if exists event_seating_units_hold_shape_check;

alter table public.event_seating_units
  add constraint event_seating_units_hold_shape_check
  check (
    (
      status = 'reserved'
      and reserved_by is not null
      and reserved_until is not null
    )
    or status <> 'reserved'
  );

create index if not exists event_seating_units_cart_hold_idx
  on public.event_seating_units (reserved_by, event_id)
  where status = 'reserved' and reserved_order_id is null;

create or replace function public.seating_unit_is_owner_cart_hold(
  p_status text,
  p_reserved_by uuid,
  p_reserved_until timestamptz,
  p_reserved_order_id uuid,
  p_owner_id uuid
)
returns boolean
language sql
stable
as $$
  select
    p_status = 'reserved'
    and p_reserved_by is not distinct from p_owner_id
    and p_reserved_order_id is null
    and p_reserved_until is not null
    and p_reserved_until > now();
$$;

create or replace function public.expire_seating_cart_hold(p_unit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.event_seating_units
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  where id = p_unit_id
    and status = 'reserved'
    and reserved_order_id is null
    and reserved_until <= now();

  return found;
end;
$$;

create or replace function public.expire_seating_cart_holds()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with expired as (
    select u.id
    from public.event_seating_units as u
    where u.status = 'reserved'
      and u.reserved_order_id is null
      and u.reserved_until <= now()
    order by u.reserved_until asc
    limit 2500
    for update skip locked
  )
  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  from expired
  where u.id = expired.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
  v_hold_until timestamptz := now() + interval '8 minutes';
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

create or replace function public.release_seating_unit_cart_hold(
  p_event_id uuid,
  p_owner_id uuid,
  p_seating_unit_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.event_seating_units
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  where id = p_seating_unit_id
    and event_id = p_event_id
    and reserved_by = p_owner_id
    and status = 'reserved'
    and reserved_order_id is null;

  return found;
end;
$$;

create or replace function public.get_seating_unit_cart_hold(
  p_event_id uuid,
  p_owner_id uuid,
  p_seating_unit_id uuid
)
returns table (seating_unit_id uuid, reserved_until timestamptz)
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
  select u.id, u.reserved_until
  from public.event_seating_units as u
  where u.id = p_seating_unit_id
    and u.event_id = p_event_id
    and public.seating_unit_is_owner_cart_hold(
      u.status,
      u.reserved_by,
      u.reserved_until,
      u.reserved_order_id,
      p_owner_id
    );
end;
$$;

revoke all on function public.seating_unit_is_owner_cart_hold(text, uuid, timestamptz, uuid, uuid) from public;
grant execute on function public.seating_unit_is_owner_cart_hold(text, uuid, timestamptz, uuid, uuid)
  to authenticated, service_role;

revoke all on function public.expire_seating_cart_hold(uuid) from public;
grant execute on function public.expire_seating_cart_hold(uuid) to service_role;

revoke all on function public.expire_seating_cart_holds() from public;
grant execute on function public.expire_seating_cart_holds() to service_role;

revoke all on function public.hold_seating_unit_for_cart(uuid, uuid, uuid) from public;
grant execute on function public.hold_seating_unit_for_cart(uuid, uuid, uuid)
  to authenticated, service_role;

revoke all on function public.release_seating_unit_cart_hold(uuid, uuid, uuid) from public;
grant execute on function public.release_seating_unit_cart_hold(uuid, uuid, uuid)
  to authenticated, service_role;

revoke all on function public.get_seating_unit_cart_hold(uuid, uuid, uuid) from public;
grant execute on function public.get_seating_unit_cart_hold(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public.hold_seating_unit_for_cart(uuid, uuid, uuid) is
  'Hold de carrito (8m) sobre event_seating_units sin crear orden. reserved_order_id queda null.';

create or replace function public.claim_seating_unit_for_checkout(
  p_unit_id uuid,
  p_event_id uuid,
  p_tier_id uuid,
  p_owner_id uuid,
  p_order_id uuid,
  p_hold_until timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_until timestamptz;
begin
  select * into v_unit
  from public.event_seating_units as u
  where u.id = p_unit_id
    and u.event_id = p_event_id
    and u.tier_id = p_tier_id;

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
    where id = p_unit_id
      and event_id = p_event_id
      and tier_id = p_tier_id
    for update;
  exception
    when lock_not_available then
      raise exception 'SEATING_UNIT_UNAVAILABLE'
        using errcode = 'P0001';
  end;

  if v_unit.status <> 'available'
     and not public.seating_unit_is_owner_cart_hold(
       v_unit.status,
       v_unit.reserved_by,
       v_unit.reserved_until,
       v_unit.reserved_order_id,
       p_owner_id
     ) then
    raise exception 'SEATING_UNIT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  v_until := case
    when public.seating_unit_is_owner_cart_hold(
      v_unit.status,
      v_unit.reserved_by,
      v_unit.reserved_until,
      v_unit.reserved_order_id,
      p_owner_id
    ) then v_unit.reserved_until
    else p_hold_until
  end;

  update public.event_seating_units
  set
    status = 'reserved',
    reserved_by = p_owner_id,
    reserved_order_id = p_order_id,
    reserved_until = v_until,
    updated_at = now()
  where id = p_unit_id
    and (
      status = 'available'
      or (
        status = 'reserved'
        and reserved_by is not distinct from p_owner_id
        and reserved_order_id is null
        and reserved_until > now()
      )
    );

  if not found then
    raise exception 'SEATING_UNIT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  return v_until;
end;
$$;

revoke all on function public.claim_seating_unit_for_checkout(uuid, uuid, uuid, uuid, uuid, timestamptz)
  from public;
grant execute on function public.claim_seating_unit_for_checkout(uuid, uuid, uuid, uuid, uuid, timestamptz)
  to authenticated, service_role;

-- Attach cart holds when creating the pending order (keep remaining reserved_until).
-- Body matches P53, with claim_seating_unit_for_checkout instead of UPDATE ... available.
