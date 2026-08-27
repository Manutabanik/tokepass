-- P175 · Inventory primary key is (event, layout_item, jornada).
--
-- hold_seat / resolve_seat_hold_unit still matched undated units to any day
-- and could resolve mesa-09 from another event. POS/layout lookup had the
-- same hole. GA zone caps summed Friday sold into Saturday. Materialize
-- still built undated units from venues.seating_layout when maps were missing.
-- get_event_seating_unit hid event_date_id so reserveSeatAtomic could not
-- carry the jornada into checkout.

-- ---------------------------------------------------------------------------
-- 1) Resolve a hold unit: event + exact day on 2+ jornadas
-- ---------------------------------------------------------------------------
drop function if exists public.resolve_seat_hold_unit(text, uuid);
drop function if exists public.resolve_seat_hold_unit(text, uuid, uuid);

create function public.resolve_seat_hold_unit(
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

  if coalesce(v_days, 0) >= 2 and p_event_date_id is null then
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
      if p_event_id is not null
         and coalesce(v_days, 0) >= 2
         and v_unit.event_date_id is distinct from p_event_date_id then
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
    and (
      case
        when coalesce(v_days, 0) >= 2 then
          u.event_date_id = p_event_date_id
        else
          p_event_date_id is null
          or u.event_date_id is not distinct from p_event_date_id
      end
    )
  order by
    case when u.status in ('available', 'reserved') then 0 else 1 end,
    u.id
  limit 1;

  return v_unit;
end;
$$;

revoke all on function public.resolve_seat_hold_unit(text, uuid, uuid)
  from public, anon;
grant execute on function public.resolve_seat_hold_unit(text, uuid, uuid)
  to authenticated, service_role;

comment on function public.resolve_seat_hold_unit(text, uuid, uuid) is
  'Resolves layout_item_id or unit UUID. Multi-day requires exact event_date_id; optional p_event_id scopes the event.';

-- ---------------------------------------------------------------------------
-- 2) hold_seat accepts the event so mesa-09 cannot jump events
-- ---------------------------------------------------------------------------
drop function if exists public.hold_seat(text, uuid, text);
drop function if exists public.hold_seat(text, uuid, text, uuid);

create function public.hold_seat(
  p_seat_id text,
  p_event_date_id uuid,
  p_session_id text,
  p_event_id uuid default null
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
  v_days integer := 0;
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

  if p_event_id is not null then
    select count(*)::integer
      into v_days
    from public.event_schedules
    where event_id = p_event_id;
    if coalesce(v_days, 0) >= 2 and p_event_date_id is null then
      raise exception 'missing_event_date_id' using errcode = 'P0001';
    end if;
  end if;

  v_unit := public.resolve_seat_hold_unit(p_seat_id, p_event_date_id, p_event_id);
  if v_unit.id is null then
    raise exception 'Ubicación no encontrada'
      using errcode = 'P0002';
  end if;

  if p_event_id is not null and v_unit.event_id is distinct from p_event_id then
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
    and status is distinct from 'pending_payment'
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
    and public.seat_hold_is_live(h)
  for update;

  if found
     and v_other.user_session_id is distinct from v_session
     and v_other.owner_id is distinct from v_owner then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if found and v_other.status = 'pending_payment' then
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

revoke all on function public.hold_seat(text, uuid, text, uuid)
  from public, anon;
grant execute on function public.hold_seat(text, uuid, text, uuid)
  to authenticated, service_role;

comment on function public.hold_seat(text, uuid, text, uuid) is
  'Holds a seat. p_event_id scopes the event; multi-day requires event_date_id.';

-- ---------------------------------------------------------------------------
-- 3) Public unit lookup exposes jornada
-- ---------------------------------------------------------------------------
drop function if exists public.get_event_seating_unit(uuid, uuid);

create function public.get_event_seating_unit(
  p_event_id uuid,
  p_unit_id uuid
)
returns table (
  id uuid,
  tier_id uuid,
  sector_id text,
  sector_name text,
  layout_item_id text,
  label text,
  status text,
  reserved_until timestamptz,
  event_date_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if not public.seating_catalog_is_readable(p_event_id) then
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
    public.seating_unit_live_status(u.status, u.reserved_until),
    case
      when public.seating_unit_live_status(u.status, u.reserved_until) = 'reserved'
        then u.reserved_until
      else null
    end,
    u.event_date_id
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.id = p_unit_id
    and u.event_id = p_event_id
    and tt.visibility = 'public';
end;
$$;

revoke all on function public.get_event_seating_unit(uuid, uuid) from public;
grant execute on function public.get_event_seating_unit(uuid, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) GA zone cap is per jornada (same sector on Friday ≠ Saturday)
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
  v_day uuid;
  v_zone public.event_zones%rowtype;
  v_used integer := 0;
  v_additional integer := greatest(0, coalesce(p_quantity, 0));
begin
  if not public.event_uses_live_stock(p_event_id) then
    return;
  end if;

  select
    nullif(btrim(coalesce(tt.seating_sector_id, '')), ''),
    tt.day_id
    into v_sector, v_day
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
    and tt.event_id = p_event_id;

  if v_sector is null or v_sector not like 'general:%' then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_event_id::text),
    hashtext(v_sector || coalesce(v_day::text, ''))
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
    and tt.seating_sector_id = v_sector
    and (
      v_day is null
      or tt.day_id is null
      or tt.day_id = v_day
    );

  if (v_used + v_additional) > v_zone.capacity then
    raise exception 'INVENTORY_CONFLICT_409'
      using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.assert_logical_sector_stock(uuid, uuid, integer) is
  'GA zone cap. Day-bound tiers only count sold of the same jornada (plus undated abonos).';

-- ---------------------------------------------------------------------------
-- 5) Multi-day without maps must not invent undated units from venue layout
-- ---------------------------------------------------------------------------
create or replace function public.materialize_event_seating_units(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_added integer := 0;
  v_tier public.ticket_tiers%rowtype;
  v_map public.seating_maps%rowtype;
  v_day_count integer := 0;
  v_has_maps boolean := false;
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

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  select exists (
    select 1
    from public.seating_maps as sm
    where sm.event_id = p_event_id
      and jsonb_typeof(sm.seating_layout) = 'array'
      and jsonb_array_length(sm.seating_layout) > 0
  )
    into v_has_maps;

  if v_day_count >= 2 and not v_has_maps then
    perform public.purge_orphan_undated_seating_units(p_event_id);
    return 0;
  end if;

  if v_has_maps then
    for v_map in
      select *
      from public.seating_maps as sm
      where sm.event_id = p_event_id
    loop
      if v_day_count >= 2 and v_map.event_date_id is null then
        continue;
      end if;
      for v_tier in
        select *
        from public.ticket_tiers as tt
        where tt.event_id = p_event_id
          and tt.layout_type <> 'general'
          and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null
          and (
            v_day_count < 2
            or tt.day_id is not distinct from v_map.event_date_id
          )
      loop
        v_added := public.apply_seating_layout_to_tier(
          v_tier,
          v_map.seating_layout,
          v_map.event_date_id
        );
        v_count := v_count + v_added;
      end loop;
    end loop;
    perform public.purge_orphan_undated_seating_units(p_event_id);
    return v_count;
  end if;

  update public.ticket_tiers as tt
  set seating_sector_id = tt.seating_sector_id
  where tt.event_id = p_event_id
    and tt.layout_type <> 'general'
    and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null;

  get diagnostics v_count = row_count;
  perform public.purge_orphan_undated_seating_units(p_event_id);
  return v_count;
end;
$$;
