-- P164: seat_holds ledger (TTL 15m) + hold_seat / purchase_held_seats atómicos.
-- No reemplaza event_seating_units.reserved_*; se escribe en la misma transacción.

create or replace function public.checkout_hold_until()
returns timestamptz
language sql
stable
set search_path = pg_catalog, public
as $$
  select clock_timestamp() + interval '15 minutes';
$$;

create table if not exists public.seat_holds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_date_id uuid,
  event_date_key uuid not null
    default '00000000-0000-0000-0000-000000000000'::uuid,
  layout_item_id text not null,
  seating_unit_id uuid references public.event_seating_units(id) on delete cascade,
  user_session_id text not null,
  owner_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint seat_holds_layout_item_id_check check (btrim(layout_item_id) <> ''),
  constraint seat_holds_session_check check (btrim(user_session_id) <> ''),
  constraint seat_holds_event_date_layout_key
    unique (event_id, event_date_key, layout_item_id)
);

create unique index if not exists seat_holds_seating_unit_uidx
  on public.seat_holds (seating_unit_id)
  where seating_unit_id is not null;

create index if not exists seat_holds_expiry_idx
  on public.seat_holds (expires_at);

create index if not exists seat_holds_session_idx
  on public.seat_holds (user_session_id, event_id);

alter table public.seat_holds enable row level security;

revoke all on table public.seat_holds from public, anon;
grant select on table public.seat_holds to authenticated;
grant all on table public.seat_holds to service_role;

drop policy if exists seat_holds_select_own on public.seat_holds;
create policy seat_holds_select_own
  on public.seat_holds
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or user_session_id = (select auth.uid())::text
  );

comment on table public.seat_holds is
  'Hold de asiento por sesión (15m). Fuente de verdad de carrera; event_seating_units se sincroniza en el mismo RPC.';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.seat_hold_date_key(p_event_date_id uuid)
returns uuid
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(p_event_date_id, '00000000-0000-0000-0000-000000000000'::uuid);
$$;

create or replace function public.seat_is_sold(
  p_unit public.event_seating_units
)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    p_unit.status = 'sold'
    or p_unit.sold_order_id is not null
    or exists (
      select 1
      from public.tickets as t
      where t.seating_unit_id = p_unit.id
        and t.status in (
          'valid'::public.ticket_status,
          'pending_payment'::public.ticket_status,
          'used'::public.ticket_status,
          'transferred'::public.ticket_status,
          'scanned'::public.ticket_status
        )
    );
$$;

create or replace function public.upsert_seat_hold_for_unit(
  p_unit_id uuid,
  p_session_id text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_layout text;
  v_session text := nullif(btrim(coalesce(p_session_id, '')), '');
  v_hold_id uuid;
  v_owner uuid;
begin
  if p_unit_id is null or v_session is null or p_expires_at is null then
    return null;
  end if;

  select * into v_unit
  from public.event_seating_units
  where id = p_unit_id;

  if not found then
    return null;
  end if;

  v_layout := nullif(btrim(coalesce(v_unit.layout_item_id, '')), '');
  if v_layout is null then
    v_layout := v_unit.id::text;
  end if;

  begin
    v_owner := v_session::uuid;
  exception
    when invalid_text_representation then
      v_owner := auth.uid();
  end;

  insert into public.seat_holds (
    event_id,
    event_date_id,
    event_date_key,
    layout_item_id,
    seating_unit_id,
    user_session_id,
    owner_id,
    expires_at
  )
  values (
    v_unit.event_id,
    v_unit.event_date_id,
    public.seat_hold_date_key(v_unit.event_date_id),
    v_layout,
    v_unit.id,
    v_session,
    v_owner,
    p_expires_at
  )
  on conflict on constraint seat_holds_event_date_layout_key
  do update set
    seating_unit_id = excluded.seating_unit_id,
    user_session_id = excluded.user_session_id,
    owner_id = excluded.owner_id,
    expires_at = excluded.expires_at
  where
    public.seat_holds.expires_at <= clock_timestamp()
    or public.seat_holds.user_session_id = excluded.user_session_id
  returning id into v_hold_id;

  if v_hold_id is null then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  return v_hold_id;
end;
$$;

create or replace function public.delete_seat_holds_for_unit(
  p_unit_id uuid,
  p_session_id text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_session text := nullif(btrim(coalesce(p_session_id, '')), '');
begin
  delete from public.seat_holds
  where seating_unit_id = p_unit_id
    and (v_session is null or user_session_id = v_session);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.resolve_seat_hold_unit(
  p_seat_id text,
  p_event_date_id uuid
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
begin
  if v_seat is null then
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
    limit 1;

    if found then
      return v_unit;
    end if;
  end if;

  select u.*
    into v_unit
  from public.event_seating_units as u
  left join public.ticket_tiers as t on t.id = u.tier_id
  where u.layout_item_id = v_seat
    and (
      p_event_date_id is null
      or coalesce(u.event_date_id, t.day_id) is null
      or coalesce(u.event_date_id, t.day_id) = p_event_date_id
    )
  order by
    case when u.status in ('available', 'reserved') then 0 else 1 end,
    u.id
  limit 1;

  return v_unit;
end;
$$;

-- -----------------------------------------------------------------------------
-- hold_seat: verifica vendido + hold activo y escribe ledger + unidad
-- -----------------------------------------------------------------------------
create or replace function public.hold_seat(
  p_seat_id text,
  p_event_date_id uuid,
  p_session_id text
)
returns table (
  hold_id uuid,
  seating_unit_id uuid,
  event_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_session text := nullif(btrim(coalesce(p_session_id, '')), '');
  v_owner uuid;
  v_until timestamptz := public.checkout_hold_until();
  v_hold uuid;
  v_other public.seat_holds%rowtype;
begin
  perform set_config('lock_timeout', '4s', true);

  if v_session is null then
    raise exception 'SEAT_HOLD_SESSION_REQUIRED'
      using errcode = '22023';
  end if;

  begin
    v_owner := v_session::uuid;
  exception
    when invalid_text_representation then
      v_owner := auth.uid();
  end;

  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
    v_owner := auth.uid();
    if v_session is distinct from auth.uid()::text then
      v_session := auth.uid()::text;
    end if;
  elsif v_owner is null then
    v_owner := auth.uid();
  end if;

  v_unit := public.resolve_seat_hold_unit(p_seat_id, p_event_date_id);
  if v_unit.id is null then
    raise exception 'Ubicación no encontrada'
      using errcode = 'P0002';
  end if;

  if not public.event_is_buyable(v_unit.event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  delete from public.seat_holds
  where event_id = v_unit.event_id
    and event_date_key = public.seat_hold_date_key(
      coalesce(v_unit.event_date_id, p_event_date_id)
    )
    and layout_item_id = coalesce(
      nullif(btrim(v_unit.layout_item_id), ''),
      v_unit.id::text
    )
    and expires_at <= clock_timestamp();

  if v_unit.status = 'reserved'
     and v_unit.reserved_until <= clock_timestamp()
     and v_unit.reserved_order_id is not null then
    perform public.expire_seating_order(v_unit.reserved_order_id);
  elsif v_unit.status = 'reserved'
     and v_unit.reserved_until <= clock_timestamp()
     and v_unit.reserved_order_id is null then
    perform public.expire_seating_cart_hold(v_unit.id);
  end if;

  begin
    select * into v_unit
    from public.event_seating_units
    where id = v_unit.id
    for update;
  exception
    when lock_not_available then
      raise exception 'SEAT_UNAVAILABLE'
        using errcode = 'P0001';
  end;

  if public.seat_is_sold(v_unit) then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select *
    into v_other
  from public.seat_holds as h
  where h.event_id = v_unit.event_id
    and h.event_date_key = public.seat_hold_date_key(
      coalesce(v_unit.event_date_id, p_event_date_id)
    )
    and h.layout_item_id = coalesce(
      nullif(btrim(v_unit.layout_item_id), ''),
      v_unit.id::text
    )
    and h.expires_at > clock_timestamp()
  for update;

  if found
     and v_other.user_session_id is distinct from v_session
     and v_other.owner_id is distinct from v_owner then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if v_unit.status = 'reserved'
     and not public.seating_unit_is_owner_cart_hold(
       v_unit.status,
       v_unit.reserved_by,
       v_unit.reserved_until,
       v_unit.reserved_order_id,
       v_owner
     ) then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if v_unit.status = 'blocked' then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  perform public.hold_seating_unit_for_cart(
    v_unit.event_id,
    v_owner,
    v_unit.id
  );

  select reserved_until
    into v_until
  from public.event_seating_units
  where id = v_unit.id;

  v_until := coalesce(v_until, public.checkout_hold_until());
  v_hold := public.upsert_seat_hold_for_unit(v_unit.id, v_session, v_until);

  hold_id := v_hold;
  seating_unit_id := v_unit.id;
  event_id := v_unit.event_id;
  expires_at := v_until;
  return next;
end;
$$;

revoke all on function public.hold_seat(text, uuid, text) from public, anon;
grant execute on function public.hold_seat(text, uuid, text)
  to authenticated, service_role;

comment on function public.hold_seat(text, uuid, text) is
  'Hold atómico: rechaza asiento vendido o con seat_holds.expires_at > now() de otra sesión.';

-- -----------------------------------------------------------------------------
-- Sync existing cart-hold RPCs with the ledger
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
      raise exception 'SEAT_UNAVAILABLE'
        using errcode = 'P0001';
  end;

  if public.seat_is_sold(v_unit) then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.seat_holds as h
    where h.seating_unit_id = p_seating_unit_id
      and h.expires_at > clock_timestamp()
      and h.user_session_id is distinct from p_owner_id::text
      and h.owner_id is distinct from p_owner_id
  ) then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if public.seating_unit_is_owner_cart_hold(
    v_unit.status,
    v_unit.reserved_by,
    v_unit.reserved_until,
    v_unit.reserved_order_id,
    p_owner_id
  ) then
    perform public.upsert_seat_hold_for_unit(
      v_unit.id,
      p_owner_id::text,
      v_unit.reserved_until
    );
    seating_unit_id := v_unit.id;
    reserved_until := v_unit.reserved_until;
    return next;
    return;
  end if;

  if v_unit.status <> 'available' then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  update public.event_seating_units
     set status = 'reserved',
         reserved_by = p_owner_id,
         reserved_order_id = null,
         reserved_until = v_hold_until,
         updated_at = now()
   where id = p_seating_unit_id
     and status = 'available';

  if not found then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  perform public.upsert_seat_hold_for_unit(
    p_seating_unit_id,
    p_owner_id::text,
    v_hold_until
  );

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

  perform public.delete_seat_holds_for_unit(p_seating_unit_id, p_owner_id::text);

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

create or replace function public.expire_seating_cart_hold(p_unit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.seat_holds
  where seating_unit_id = p_unit_id
    and expires_at <= clock_timestamp();

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

create or replace function public.expire_seating_cart_holds(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
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
    limit v_batch
    for update skip locked
  ),
  dropped as (
    delete from public.seat_holds as h
    using expired
    where h.seating_unit_id = expired.id
    returning h.id
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

create or replace function public.release_seat_holds(
  p_session_id text,
  p_event_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session text := nullif(btrim(coalesce(p_session_id, '')), '');
  v_owner uuid;
  v_count integer := 0;
  v_hold public.seat_holds%rowtype;
begin
  if v_session is null then
    return 0;
  end if;

  begin
    v_owner := v_session::uuid;
  exception
    when invalid_text_representation then
      v_owner := auth.uid();
  end;

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or (auth.uid()::text is distinct from v_session
          and auth.uid() is distinct from v_owner)) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_hold in
    select *
    from public.seat_holds as h
    where h.user_session_id = v_session
      and (p_event_id is null or h.event_id = p_event_id)
    for update
  loop
    if v_hold.seating_unit_id is not null and v_owner is not null then
      perform public.release_seating_unit_cart_hold(
        v_hold.event_id,
        v_owner,
        v_hold.seating_unit_id
      );
    end if;
    delete from public.seat_holds where id = v_hold.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.release_seat_holds(text, uuid) from public, anon;
grant execute on function public.release_seat_holds(text, uuid)
  to authenticated, service_role;

create or replace function public.expire_seat_holds(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
  v_hold public.seat_holds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_hold in
    select *
    from public.seat_holds as h
    where h.expires_at <= clock_timestamp()
    order by h.expires_at asc
    limit v_batch
    for update skip locked
  loop
    delete from public.seat_holds where id = v_hold.id;
    if v_hold.seating_unit_id is not null then
      perform public.expire_seating_cart_hold(v_hold.seating_unit_id);
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_seat_holds(integer) from public;
grant execute on function public.expire_seat_holds(integer) to service_role;

-- -----------------------------------------------------------------------------
-- Purchase: verificar holds vigentes → tickets → borrar holds (o rollback)
-- -----------------------------------------------------------------------------
create or replace function public.assert_seat_holds_for_purchase(
  p_event_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_seat uuid;
  v_unit public.event_seating_units%rowtype;
  v_hold public.seat_holds%rowtype;
  v_session text := nullif(btrim(coalesce(p_session_id, p_owner_id::text, '')), '');
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_seat := public.checkout_cart_item_seat_id(v_item);
    if v_seat is null then
      continue;
    end if;

    begin
      select * into v_unit
      from public.event_seating_units
      where id = v_seat
        and event_id = p_event_id
      for update;
    exception
      when lock_not_available then
        raise exception 'SEAT_HOLD_EXPIRED'
          using errcode = 'P0001',
            message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
    end;

    if not found then
      raise exception 'SEAT_HOLD_EXPIRED'
        using errcode = 'P0001',
          message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
    end if;

    if public.seat_is_sold(v_unit)
       and v_unit.reserved_order_id is null then
      raise exception 'SEAT_HOLD_EXPIRED'
        using errcode = 'P0001',
          message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
    end if;

    select *
      into v_hold
    from public.seat_holds as h
    where h.seating_unit_id = v_seat
      and h.event_id = p_event_id
    for update;

    if found then
      if v_hold.expires_at <= clock_timestamp()
         or (
           v_hold.user_session_id is distinct from v_session
           and v_hold.owner_id is distinct from p_owner_id
         ) then
        raise exception 'SEAT_HOLD_EXPIRED'
          using errcode = 'P0001',
            message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
      end if;
    elsif not public.seating_unit_is_owner_cart_hold(
      v_unit.status,
      v_unit.reserved_by,
      v_unit.reserved_until,
      v_unit.reserved_order_id,
      p_owner_id
    ) and v_unit.status <> 'available' then
      raise exception 'SEAT_HOLD_EXPIRED'
        using errcode = 'P0001',
          message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
    end if;
  end loop;
end;
$$;

create or replace function public.consume_seat_holds_for_purchase(
  p_event_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_seat uuid;
  v_count integer := 0;
  v_session text := nullif(btrim(coalesce(p_session_id, p_owner_id::text, '')), '');
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_seat := public.checkout_cart_item_seat_id(v_item);
    if v_seat is null then
      continue;
    end if;

    delete from public.seat_holds
    where seating_unit_id = v_seat
      and event_id = p_event_id
      and (
        user_session_id = v_session
        or owner_id is not distinct from p_owner_id
      );

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

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
  v_hold public.seat_holds%rowtype;
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

  select *
    into v_hold
  from public.seat_holds as h
  where h.seating_unit_id = p_unit_id
  for update;

  if found then
    if v_hold.expires_at <= clock_timestamp()
       or (
         v_hold.owner_id is distinct from p_owner_id
         and v_hold.user_session_id is distinct from p_owner_id::text
       ) then
      raise exception 'SEAT_HOLD_EXPIRED'
        using errcode = 'P0001',
          message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
    end if;
  end if;

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

  perform public.delete_seat_holds_for_unit(p_unit_id, p_owner_id::text);

  return v_until;
end;
$$;

create or replace function public.reserve_tickets_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  perform public.assert_seat_holds_for_purchase(
    p_event_id,
    p_owner_id,
    p_owner_id::text,
    p_items
  );

  return query
  select *
  from public.claim_and_reserve_ga_cart_tx(
    p_event_id,
    p_owner_id,
    p_items,
    p_promoter_id
  );

  perform public.consume_seat_holds_for_purchase(
    p_event_id,
    p_owner_id,
    p_owner_id::text,
    p_items
  );
end;
$$;

create or replace function public.purchase_held_seats_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_items jsonb,
  p_promoter_id uuid default null,
  p_holder_dni text default null,
  p_holder_email text default null,
  p_addons jsonb default '[]'::jsonb
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform public.assert_seat_holds_for_purchase(
    p_event_id,
    p_owner_id,
    coalesce(nullif(btrim(coalesce(p_session_id, '')), ''), p_owner_id::text),
    p_items
  );

  return query
  select *
  from public.reserve_hybrid_cart_tx(
    p_event_id,
    p_owner_id,
    p_items,
    p_promoter_id,
    p_holder_dni,
    p_holder_email,
    coalesce(p_addons, '[]'::jsonb)
  );

  perform public.consume_seat_holds_for_purchase(
    p_event_id,
    p_owner_id,
    coalesce(nullif(btrim(coalesce(p_session_id, '')), ''), p_owner_id::text),
    p_items
  );
end;
$$;

revoke all on function public.purchase_held_seats_tx(uuid, uuid, text, jsonb, uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.purchase_held_seats_tx(uuid, uuid, text, jsonb, uuid, text, text, jsonb)
  to authenticated, service_role;

revoke all on function public.upsert_seat_hold_for_unit(uuid, text, timestamptz) from public, anon;
grant execute on function public.upsert_seat_hold_for_unit(uuid, text, timestamptz)
  to service_role;

revoke all on function public.delete_seat_holds_for_unit(uuid, text) from public, anon;
grant execute on function public.delete_seat_holds_for_unit(uuid, text)
  to service_role;

revoke all on function public.assert_seat_holds_for_purchase(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.assert_seat_holds_for_purchase(uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.consume_seat_holds_for_purchase(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.consume_seat_holds_for_purchase(uuid, uuid, text, jsonb)
  to service_role;

comment on function public.purchase_held_seats_tx(uuid, uuid, text, jsonb, uuid, text, text, jsonb) is
  'Compra atómica: verifica seat_holds vigentes, inserta tickets y borra los holds. Rollback si expiraron.';

create or replace function public.release_leftover_cart_holds_for_order(
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_buyer uuid;
  v_event uuid;
  v_count integer := 0;
  v_unit public.event_seating_units%rowtype;
  v_released integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return 0;
  end if;

  select o.buyer_id
    into v_buyer
  from public.orders as o
  where o.id = p_order_id;

  if v_buyer is null then
    return 0;
  end if;

  for v_event in
    select distinct t.event_id
    from public.tickets as t
    where t.order_id = p_order_id
      and t.event_id is not null
  loop
    select public.release_ga_cart_holds(v_event, v_buyer)
      into v_released;
    v_count := v_count + coalesce(v_released, 0);
    v_count := v_count + coalesce(
      public.release_seat_holds(v_buyer::text, v_event),
      0
    );

    for v_unit in
      select u.*
      from public.event_seating_units as u
      where u.event_id = v_event
        and u.reserved_by = v_buyer
        and u.status = 'reserved'
        and u.reserved_order_id is null
      for update of u
    loop
      if public.release_seating_unit_cart_hold(
        v_event,
        v_buyer,
        v_unit.id
      ) then
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;
