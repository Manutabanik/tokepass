-- P172 · Publish maps and checkout cart are per jornada.
-- 1) Atomic seating_maps upsert/delete (same transaction as publish_event_v2).
-- 2) normalize_checkout_cart_items resolves mesa-09 by event_date_id.
-- 3) Sector summary groups by event_date_id so Friday sold-out is not Saturday.

create or replace function public.sync_published_seating_maps(
  p_event_id uuid,
  p_maps jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_day uuid;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_day_count integer := 0;
begin
  if p_event_id is null then
    raise exception 'Evento inválido' using errcode = '22023';
  end if;

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  if p_maps is null
     or jsonb_typeof(p_maps) <> 'array'
     or jsonb_array_length(p_maps) = 0 then
    delete from public.seating_maps
    where event_id = p_event_id;
    return;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_maps)
  loop
    v_id := null;
    v_day := null;
    begin
      v_day := nullif(btrim(coalesce(v_item ->> 'event_date_id', '')), '')::uuid;
    exception
      when others then
        v_day := null;
    end;

    if v_day is not null
       and not exists (
         select 1
         from public.event_schedules as s
         where s.id = v_day
           and s.event_id = p_event_id
       ) then
      if v_day_count >= 2 then
        raise exception 'El mapa de una jornada no coincide con el cronograma'
          using errcode = '22023';
      end if;
      v_day := null;
    end if;

    if v_day is not null then
      update public.seating_maps
      set
        map_config = coalesce(v_item -> 'map_config', '{}'::jsonb),
        pricing = coalesce(v_item -> 'pricing', '{}'::jsonb),
        updated_at = now()
      where event_id = p_event_id
        and event_date_id = v_day
      returning id into v_id;
    else
      update public.seating_maps
      set
        map_config = coalesce(v_item -> 'map_config', '{}'::jsonb),
        pricing = coalesce(v_item -> 'pricing', '{}'::jsonb),
        updated_at = now()
      where event_id = p_event_id
        and event_date_id is null
      returning id into v_id;
    end if;

    if v_id is null then
      insert into public.seating_maps (
        event_id,
        event_date_id,
        map_config,
        pricing
      )
      values (
        p_event_id,
        v_day,
        coalesce(v_item -> 'map_config', '{}'::jsonb),
        coalesce(v_item -> 'pricing', '{}'::jsonb)
      )
      returning id into v_id;
    end if;

    v_keep := array_append(v_keep, v_id);
  end loop;

  delete from public.seating_maps
  where event_id = p_event_id
    and not (id = any (v_keep));
end;
$$;

comment on function public.sync_published_seating_maps(uuid, jsonb) is
  'Replace seating_maps for one event in a single transaction. Multi-day maps must match event_schedules.id.';

revoke all on function public.sync_published_seating_maps(uuid, jsonb)
  from public, anon;
grant execute on function public.sync_published_seating_maps(uuid, jsonb)
  to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.publish_event_v2_core(uuid, jsonb)') is null
     and to_regprocedure('public.publish_event_v2(uuid, jsonb)') is not null then
    alter function public.publish_event_v2(uuid, jsonb)
      rename to publish_event_v2_core;
  end if;
end
$$;

create or replace function public.publish_event_v2(
  p_event_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.publish_event_v2_core(p_event_id, p_payload);
  perform public.sync_published_seating_maps(
    p_event_id,
    case
      when p_payload ? 'seating_maps'
           and jsonb_typeof(p_payload -> 'seating_maps') = 'array'
        then p_payload -> 'seating_maps'
      else '[]'::jsonb
    end
  );
  return v_result;
end;
$$;

revoke all on function public.publish_event_v2(uuid, jsonb) from public, anon;
revoke all on function public.publish_event_v2_core(uuid, jsonb) from public, anon;
grant execute on function public.publish_event_v2(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.publish_event_v2_core(uuid, jsonb)
  to service_role;

comment on function public.publish_event_v2(uuid, jsonb) is
  'Event Creator V2 unpack + atomic seating_maps sync. If maps fail, the whole publish rolls back.';

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
             and (
               v_event_date_id is null
               or u.event_date_id is not distinct from v_event_date_id
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
          and (
            v_event_date_id is null
            or u.event_date_id is not distinct from v_event_date_id
          )
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
  'Normaliza items general/mapped. En 2+ jornadas exige event_date_id y resuelve layout_item_id por día.';

drop function if exists public.get_event_seating_sector_summary(uuid);

create function public.get_event_seating_sector_summary(p_event_id uuid)
returns table (
  sector_id text,
  sector_name text,
  color text,
  layout_type text,
  capacity_per_unit integer,
  tier_id uuid,
  available integer,
  reserved integer,
  sold integer,
  blocked integer,
  total integer,
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
    u.sector_id,
    min(u.sector_name) as sector_name,
    min(u.color) as color,
    min(u.layout_type) as layout_type,
    min(u.capacity_per_unit)::integer as capacity_per_unit,
    (min(u.tier_id::text))::uuid as tier_id,
    count(*) filter (
      where public.seating_unit_live_status(u.status, u.reserved_until) = 'available'
    )::integer as available,
    count(*) filter (
      where public.seating_unit_live_status(u.status, u.reserved_until) = 'reserved'
    )::integer as reserved,
    count(*) filter (
      where public.seating_unit_live_status(u.status, u.reserved_until) = 'sold'
    )::integer as sold,
    count(*) filter (
      where public.seating_unit_live_status(u.status, u.reserved_until) = 'blocked'
    )::integer as blocked,
    count(*)::integer as total,
    u.event_date_id
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and tt.visibility = 'public'
  group by u.sector_id, u.event_date_id
  order by min(u.sector_name), u.event_date_id;
end;
$$;

revoke all on function public.get_event_seating_sector_summary(uuid) from public;
grant execute on function public.get_event_seating_sector_summary(uuid)
  to anon, authenticated, service_role;

comment on function public.get_event_seating_sector_summary(uuid) is
  'Inventory totals per sector and jornada (event_date_id). Friday sold-out is not Saturday.';
