-- =============================================================================
-- P101 · Master Manifest: inventario estructural (mapa) vs SKU comercial flotante
--
-- ticket_tiers.seating_sector_id es el sector_id opcional del SKU.
-- NULL = la entrada vive con su propio max_capacity (total_capacity) sin padre.
-- POS / checkout: assert_logical_sector_stock ya ignora seating_sector_id NULL.
-- =============================================================================

alter table public.ticket_tiers
  alter column seating_sector_id drop not null;

alter table public.ticket_tiers
  alter column zone_id drop not null;

comment on column public.ticket_tiers.seating_sector_id is
  'sector_id opcional del SKU. NULL = inventario comercial flotante (Master Manifest). '
  'Payloads aceptan seating_sector_id, seatingSectorId o sector_id.';

comment on column public.ticket_tiers.zone_id is
  'FK opcional a event_zones. NULL si la entrada no está ligada a un sector.';

comment on column public.ticket_tiers.total_capacity is
  'max_capacity del SKU. Independiente de un sector padre cuando seating_sector_id es NULL.';

-- -----------------------------------------------------------------------------
-- Payload helpers: omitted / null / "" nunca heredan la zona 0
-- -----------------------------------------------------------------------------
create or replace function public.ticket_tier_payload_sector_id(p_tier jsonb)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(coalesce(
      nullif(p_tier ->> 'seating_sector_id', ''),
      nullif(p_tier ->> 'seatingSectorId', ''),
      nullif(p_tier ->> 'sector_id', ''),
      ''
    )),
    ''
  );
$$;

create or replace function public.ticket_tier_payload_zone_index(p_tier jsonb)
returns integer
language plpgsql
immutable
as $$
declare
  v_raw text;
begin
  v_raw := nullif(btrim(coalesce(
    p_tier ->> 'zone_index',
    p_tier ->> 'zoneIndex',
    ''
  )), '');

  if v_raw is null then
    return null;
  end if;

  if v_raw !~ '^-?[0-9]+$' then
    return null;
  end if;

  return v_raw::integer;
end;
$$;

create or replace function public.ticket_tier_resolve_zone_id(
  p_event_id uuid,
  p_tier jsonb
)
returns uuid
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_sector text;
  v_index integer;
  v_zone_id uuid;
  v_slug text;
begin
  v_sector := public.ticket_tier_payload_sector_id(p_tier);
  if v_sector is null then
    return null;
  end if;

  v_index := public.ticket_tier_payload_zone_index(p_tier);
  if v_index is not null and v_index >= 0 then
    select ez.id
      into v_zone_id
    from public.event_zones as ez
    where ez.event_id = p_event_id
    order by ez.created_at, ez.id
    offset v_index
    limit 1;

    if v_zone_id is not null then
      return v_zone_id;
    end if;
  end if;

  if v_sector like 'general:%' then
    v_slug := lower(split_part(v_sector, ':', 2));
    select ez.id
      into v_zone_id
    from public.event_zones as ez
    where ez.event_id = p_event_id
      and ez.type = 'general_admission'
      and (
        lower(replace(ez.name, ' ', '-')) = v_slug
        or lower(ez.name) = replace(v_slug, '-', ' ')
      )
    order by ez.created_at, ez.id
    limit 1;
    return v_zone_id;
  end if;

  select ez.id
    into v_zone_id
  from public.event_zones as ez
  where ez.event_id = p_event_id
    and (
      ez.id::text = v_sector
      or ez.name = v_sector
    )
  order by ez.created_at, ez.id
  limit 1;

  return v_zone_id;
end;
$$;

revoke all on function public.ticket_tier_payload_sector_id(jsonb) from public;
revoke all on function public.ticket_tier_payload_zone_index(jsonb) from public;
revoke all on function public.ticket_tier_resolve_zone_id(uuid, jsonb) from public;
grant execute on function public.ticket_tier_payload_sector_id(jsonb)
  to authenticated, service_role;
grant execute on function public.ticket_tier_payload_zone_index(jsonb)
  to authenticated, service_role;
grant execute on function public.ticket_tier_resolve_zone_id(uuid, jsonb)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- configure: acepta sector_id null y despega zone_id de SKUs flotantes.
-- Cubre create_complete_event_tx, que aún hace coalesce(zone_index, 0).
-- -----------------------------------------------------------------------------
create or replace function public.configure_event_seating_tiers(
  p_event_id uuid,
  p_configs jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config jsonb;
  v_tier_id uuid;
  v_updated integer;
  v_sector text;
  v_zone_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and not exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and (
        e.organizer_id = auth.uid()
        or public.is_super_admin()
      )
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_configs is null or jsonb_typeof(p_configs) <> 'array' then
    raise exception 'p_configs debe ser un array'
      using errcode = '22023';
  end if;

  for v_config in
    select value from jsonb_array_elements(p_configs)
  loop
    v_tier_id := null;
    begin
      v_tier_id := nullif(v_config ->> 'id', '')::uuid;
    exception when others then
      v_tier_id := null;
    end;

    v_sector := public.ticket_tier_payload_sector_id(v_config);
    v_zone_id := public.ticket_tier_resolve_zone_id(p_event_id, v_config);

    if v_tier_id is not null then
      update public.ticket_tiers
      set
        layout_type = case
          when v_config ->> 'layout_type' in (
            'general', 'table_combo', 'numbered_seat'
          ) then v_config ->> 'layout_type'
          else 'general'
        end,
        seating_sector_id = v_sector,
        zone_id = v_zone_id,
        capacity_per_unit = greatest(
          1,
          least(
            100,
            coalesce(
              nullif(v_config ->> 'capacity_per_unit', '')::integer,
              1
            )
          )
        ),
        updated_at = now()
      where id = v_tier_id
        and event_id = p_event_id;
    else
      update public.ticket_tiers
      set
        layout_type = case
          when v_config ->> 'layout_type' in (
            'general', 'table_combo', 'numbered_seat'
          ) then v_config ->> 'layout_type'
          else 'general'
        end,
        seating_sector_id = v_sector,
        zone_id = v_zone_id,
        capacity_per_unit = greatest(
          1,
          least(
            100,
            coalesce(
              nullif(v_config ->> 'capacity_per_unit', '')::integer,
              1
            )
          )
        ),
        updated_at = now()
      where event_id = p_event_id
        and name = v_config ->> 'name';
    end if;

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'SEATING_TIER_CONFIG_AMBIGUOUS: %',
        coalesce(v_config ->> 'name', v_config ->> 'id', '?')
        using errcode = '23514';
    end if;
  end loop;

  update public.ticket_tiers as tt
  set zone_id = null
  where tt.event_id = p_event_id
    and tt.layout_type = 'general'
    and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is null
    and tt.zone_id is not null;
end;
$$;

revoke all on function public.configure_event_seating_tiers(uuid, jsonb)
  from public, anon;
grant execute on function public.configure_event_seating_tiers(uuid, jsonb)
  to authenticated, service_role;

comment on function public.configure_event_seating_tiers(uuid, jsonb) is
  'Persiste layout/sector. sector_id null deja el SKU flotante y despega zone_id.';

-- -----------------------------------------------------------------------------
-- update: no atar SKUs nuevos a la primera event_zone
-- -----------------------------------------------------------------------------
create or replace function public.update_complete_event_tx(
  p_event_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_venue_id uuid;
  v_existing_venue_id uuid;
  v_tier jsonb;
  v_tier_id uuid;
  v_seen_tier_ids uuid[] := '{}';
  v_capacity integer;
  v_base_price numeric(12, 2);
  v_public_price numeric(12, 2);
  v_platform_fee numeric(12, 2);
  v_rate numeric(5, 4) := 0.15;
  v_time_limit time;
  v_zone_id uuid;
  v_seating_sector_id text;
  v_new_flyer text;
  v_visibility text;
  v_schedule_days jsonb;
  v_day_id text;
  v_tier_visibility text;
begin
  if p_event_id is null
     or payload is null
     or jsonb_typeof(payload) <> 'object' then
    raise exception 'Evento o payload inválido' using errcode = '22023';
  end if;

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or (
         auth.uid() is distinct from v_event.organizer_id
         and not public.is_super_admin()
       )
     ) then
    raise exception 'EVENT_EDIT_FORBIDDEN' using errcode = '42501';
  end if;

  if nullif(btrim(payload ->> 'title'), '') is null then
    raise exception 'El título es obligatorio' using errcode = '22023';
  end if;

  if nullif(btrim(payload ->> 'description'), '') is null then
    raise exception 'La descripción es obligatoria' using errcode = '22023';
  end if;

  begin
    perform (payload ->> 'date')::timestamptz;
  exception
    when others then
      raise exception 'Fecha inválida' using errcode = '22007';
  end;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_event.organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  begin
    v_existing_venue_id := nullif(btrim(payload ->> 'venue_id'), '')::uuid;
  exception
    when others then
      raise exception 'venue_id inválido' using errcode = '22P02';
  end;

  v_venue_id := public.resolve_event_venue_id_for_update(
    v_event.organizer_id,
    v_event.venue_id,
    payload
  );

  if v_venue_id is null then
    v_venue_id := v_event.venue_id;
  end if;

  if v_existing_venue_id is not null and v_venue_id is null then
    raise exception 'Recinto no encontrado o ajeno' using errcode = '42501';
  end if;

  v_new_flyer := coalesce(
    nullif(btrim(payload ->> 'flyer_url'), ''),
    nullif(btrim(payload ->> 'image_url'), ''),
    v_event.flyer_url,
    v_event.image_url
  );

  v_visibility := lower(coalesce(nullif(btrim(payload ->> 'visibility'), ''), coalesce(v_event.visibility, 'public')));
  if v_visibility not in ('public', 'private', 'guest_list_only') then
    raise exception 'Visibilidad de evento inválida'
      using errcode = '22023';
  end if;

  v_schedule_days := coalesce(payload -> 'schedule_days', coalesce(v_event.schedule_days, '[]'::jsonb));
  if jsonb_typeof(v_schedule_days) <> 'array' then
    raise exception 'schedule_days debe ser un arreglo JSON'
      using errcode = '22023';
  end if;

  update public.events
  set
    title = btrim(payload ->> 'title'),
    description = btrim(payload ->> 'description'),
    date = (payload ->> 'date')::timestamptz,
    location = coalesce(
      nullif(btrim(payload ->> 'location'), ''),
      nullif(btrim(payload #>> '{venue,location}'), ''),
      location
    ),
    image_url = v_new_flyer,
    flyer_url = v_new_flyer,
    venue_id = v_venue_id,
    visibility = v_visibility,
    schedule_days = v_schedule_days,
    updated_at = now()
  where id = p_event_id;

  if payload -> 'tiers' is null
     or jsonb_typeof(payload -> 'tiers') <> 'array'
     or jsonb_array_length(payload -> 'tiers') = 0 then
    raise exception 'Debes mantener al menos un tipo de entrada'
      using errcode = '22023';
  end if;

  for v_tier in
    select value from jsonb_array_elements(payload -> 'tiers')
  loop
    if nullif(btrim(v_tier ->> 'name'), '') is null then
      raise exception 'Cada tier debe tener un nombre' using errcode = '22023';
    end if;

    v_capacity := coalesce((v_tier ->> 'capacity')::integer, 0);
    if v_capacity < 1 then
      raise exception 'La capacidad del tier "%" debe ser mayor a cero',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    v_base_price := coalesce((v_tier ->> 'base_price')::numeric(12, 2), -1);
    if v_base_price < 0 then
      raise exception 'El precio base del tier "%" es inválido',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    v_public_price := public.all_in_public_price(v_base_price, v_rate);
    v_platform_fee := public.all_in_platform_fee(v_base_price, v_rate);

    v_time_limit := null;
    if nullif(btrim(v_tier ->> 'time_limit'), '') is not null then
      begin
        v_time_limit := (v_tier ->> 'time_limit')::time;
      exception
        when others then
          raise exception 'Horario inválido para el tier "%"', v_tier ->> 'name'
            using errcode = '22007';
      end;
    end if;

    begin
      v_tier_id := nullif(btrim(v_tier ->> 'id'), '')::uuid;
    exception
      when others then
        raise exception 'ID de tier inválido' using errcode = '22P02';
    end;

    v_seating_sector_id := public.ticket_tier_payload_sector_id(v_tier);
    v_zone_id := public.ticket_tier_resolve_zone_id(p_event_id, v_tier);

    if v_tier_id is not null then
      v_day_id := nullif(btrim(v_tier ->> 'day_id'), '');
      if v_day_id is not null and lower(v_day_id) = 'all' then
        v_day_id := null;
      end if;
      v_tier_visibility := lower(coalesce(nullif(btrim(v_tier ->> 'visibility'), ''), 'public'));
      if v_tier_visibility not in ('public', 'private') then
        raise exception 'Visibilidad de entrada inválida en "%"', v_tier ->> 'name'
        using errcode = '22023';
      end if;

      update public.ticket_tiers
      set
        name = btrim(v_tier ->> 'name'),
        base_price = v_base_price,
        platform_fee = v_platform_fee,
        price = v_public_price,
        capacity = v_capacity,
        time_limit = v_time_limit,
        bonus_reward = nullif(btrim(v_tier ->> 'bonus_reward'), ''),
        day_id = v_day_id,
        visibility = v_tier_visibility,
        zone_id = v_zone_id,
        seating_sector_id = v_seating_sector_id,
        updated_at = now()
      where id = v_tier_id
        and event_id = p_event_id
        and sold <= v_capacity;

      if not found then
        if exists (
          select 1
          from public.ticket_tiers as tt
          where tt.id = v_tier_id
            and tt.event_id = p_event_id
            and tt.sold > v_capacity
        ) then
          raise exception 'La capacidad de "%" no puede ser menor a % entradas reservadas/vendidas',
            v_tier ->> 'name',
            (
              select tt.sold
              from public.ticket_tiers as tt
              where tt.id = v_tier_id
            )
            using errcode = '23514';
        end if;

        raise exception 'Tier no encontrado o ajeno' using errcode = '42501';
      end if;

      v_seen_tier_ids := array_append(v_seen_tier_ids, v_tier_id);
    else
      v_day_id := nullif(btrim(v_tier ->> 'day_id'), '');
      if v_day_id is not null and lower(v_day_id) = 'all' then
        v_day_id := null;
      end if;
      v_tier_visibility := lower(coalesce(nullif(btrim(v_tier ->> 'visibility'), ''), 'public'));
      if v_tier_visibility not in ('public', 'private') then
        raise exception 'Visibilidad de entrada inválida en "%"', v_tier ->> 'name'
        using errcode = '22023';
      end if;

      insert into public.ticket_tiers (
        event_id,
        name,
        price,
        base_price,
        platform_fee,
        capacity,
        sold,
        time_limit,
        bonus_reward,
        zone_id,
        seating_sector_id,
        day_id,
        visibility
      )
      values (
        p_event_id,
        btrim(v_tier ->> 'name'),
        v_public_price,
        v_base_price,
        v_platform_fee,
        v_capacity,
        0,
        v_time_limit,
        nullif(btrim(v_tier ->> 'bonus_reward'), ''),
        v_zone_id,
        v_seating_sector_id,
        v_day_id,
        v_tier_visibility
      )
      returning id into v_tier_id;

      v_seen_tier_ids := array_append(v_seen_tier_ids, v_tier_id);
    end if;
  end loop;

  if exists (
    select 1
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id
      and not (tt.id = any(v_seen_tier_ids))
      and tt.sold > 0
  ) then
    raise exception 'No podés eliminar un tier con entradas reservadas o vendidas'
      using errcode = '23514';
  end if;

  delete from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and not (tt.id = any(v_seen_tier_ids))
    and tt.sold = 0;

  return p_event_id;
end;
$$;

revoke all on function public.update_complete_event_tx(uuid, jsonb) from public;
revoke all on function public.update_complete_event_tx(uuid, jsonb) from anon;
grant execute on function public.update_complete_event_tx(uuid, jsonb)
  to authenticated, service_role;

comment on function public.update_complete_event_tx(uuid, jsonb) is
  'Actualiza evento y tiers. SKUs sin sector_id quedan flotantes (zone_id NULL).';

-- -----------------------------------------------------------------------------
-- Aforo Master Manifest
-- total = mapa (butacas/lugares no bloqueados) + SKUs flotantes + sectores GA
-- -----------------------------------------------------------------------------
create or replace function public.venue_map_allocated_capacity(p_map jsonb)
returns integer
language plpgsql
immutable
as $$
declare
  v_total integer := 0;
  v_item jsonb;
  v_seats integer;
  v_cap integer;
  v_rows integer;
  v_cols integer;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then
    return 0;
  end if;

  if jsonb_typeof(p_map -> 'sectors') = 'array' then
    for v_item in select value from jsonb_array_elements(p_map -> 'sectors')
    loop
      if jsonb_typeof(v_item -> 'seats') = 'array' then
        select count(*)::integer
          into v_seats
        from jsonb_array_elements(v_item -> 'seats') as s
        where coalesce(s.value ->> 'status', 'available') is distinct from 'blocked';
        v_total := v_total + coalesce(v_seats, 0);
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_map -> 'elements') = 'array' then
    for v_item in select value from jsonb_array_elements(p_map -> 'elements')
    loop
      if coalesce(v_item ->> 'category', 'commercial') = 'infrastructure'
         or v_item ->> 'type' = 'infrastructure' then
        continue;
      end if;

      if v_item ->> 'type' = 'standing_zone' then
        v_cap := case
          when coalesce(v_item ->> 'capacity', '') ~ '^[0-9]+$'
            then (v_item ->> 'capacity')::integer
          else 0
        end;
        v_total := v_total + greatest(0, v_cap);
      elsif jsonb_typeof(v_item -> 'seats') = 'array' then
        select count(*)::integer
          into v_seats
        from jsonb_array_elements(v_item -> 'seats') as s
        where coalesce(s.value ->> 'status', 'available') is distinct from 'blocked';
        if v_item ->> 'sellMode' = 'group' then
          v_total := v_total + greatest(1, coalesce(v_seats, 0));
        else
          v_total := v_total + coalesce(v_seats, 0);
        end if;
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_map -> 'zones') = 'array' then
    for v_item in select value from jsonb_array_elements(p_map -> 'zones')
    loop
      if coalesce(v_item ->> 'layoutType', v_item ->> 'layout_type', '') = 'general' then
        v_cap := case
          when coalesce(v_item ->> 'capacity', '') ~ '^[0-9]+$'
            then (v_item ->> 'capacity')::integer
          else 0
        end;
        v_total := v_total + greatest(0, v_cap);
      else
        v_rows := case
          when coalesce(v_item ->> 'rows', '') ~ '^[0-9]+$'
            then (v_item ->> 'rows')::integer
          else 0
        end;
        v_cols := case
          when coalesce(v_item ->> 'itemsPerRow', v_item ->> 'items_per_row', '') ~ '^[0-9]+$'
            then coalesce(
              nullif(v_item ->> 'itemsPerRow', ''),
              v_item ->> 'items_per_row'
            )::integer
          else 0
        end;
        v_total := v_total + greatest(0, v_rows) * greatest(0, v_cols);
      end if;
    end loop;
  end if;

  return v_total;
end;
$$;

create or replace function public.event_manifest_capacity(p_event_id uuid)
returns table (
  map_capacity integer,
  floating_capacity integer,
  general_sector_capacity integer,
  total_capacity integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_map integer := 0;
  v_floating integer := 0;
  v_general integer := 0;
  v_event_map jsonb;
  v_venue_map jsonb;
begin
  if p_event_id is null then
    return;
  end if;

  select e.venue_map, v.venue_map
    into v_event_map, v_venue_map
  from public.events as e
  left join public.venues as v on v.id = e.venue_id
  where e.id = p_event_id;

  if not found then
    return;
  end if;

  v_map := public.venue_map_allocated_capacity(v_event_map);
  if v_map = 0 then
    v_map := public.venue_map_allocated_capacity(v_venue_map);
  end if;
  if v_map = 0 then
    select coalesce(sum(u.capacity_per_unit), 0)::integer
      into v_map
    from public.event_seating_units as u
    where u.event_id = p_event_id
      and u.status is distinct from 'blocked';
  end if;

  select coalesce(sum(coalesce(tt.total_capacity, tt.capacity)), 0)::integer
    into v_floating
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.layout_type = 'general'
    and coalesce(tt.tier_type, 'general') = 'general'
    and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is null;

  select coalesce(sum(z.capacity), 0)::integer
    into v_general
  from public.event_zones as z
  where z.event_id = p_event_id
    and z.type = 'general_admission';

  map_capacity := v_map;
  floating_capacity := v_floating;
  general_sector_capacity := v_general;
  total_capacity := v_map + v_floating + v_general;
  return next;
end;
$$;

revoke all on function public.venue_map_allocated_capacity(jsonb) from public;
revoke all on function public.event_manifest_capacity(uuid) from public, anon;
grant execute on function public.venue_map_allocated_capacity(jsonb)
  to authenticated, service_role;
grant execute on function public.event_manifest_capacity(uuid)
  to authenticated, service_role;

comment on function public.event_manifest_capacity(uuid) is
  'Aforo Master Manifest: mapa + max_capacity de SKUs sin sector + sectores GA. '
  'No cambia get_event_tier_live_stock (techo de venta vs venue.max_capacity).';

-- SKUs generales ya persistidos sin sector: soltar el bind a la primera zona
update public.ticket_tiers as tt
set zone_id = null
where tt.layout_type = 'general'
  and coalesce(tt.tier_type, 'general') in ('general', 'addon', 'bundle')
  and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is null
  and tt.zone_id is not null;
