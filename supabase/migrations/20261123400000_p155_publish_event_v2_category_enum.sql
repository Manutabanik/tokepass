-- P155: do not assign ticket_tiers.category from jsonb text.
-- ticket_tier_category is an ENUM; a CASE that returns text raises 42804.
-- New rows keep the column default ('standard').

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
  v_event public.events%rowtype;
  v_venue_id uuid;
  v_venue_name text;
  v_venue_location text;
  v_venue_capacity integer;
  v_venue_city text;
  v_venue_lat double precision;
  v_venue_lng double precision;
  v_province text;
  v_delivery text;
  v_tier jsonb;
  v_tier_id uuid;
  v_seen_tier_ids uuid[] := '{}';
  v_capacity integer;
  v_sold integer;
  v_visibility text;
  v_refund text;
  v_ends_at timestamptz;
  v_flyer text;
  v_banner text;
  v_venue_map jsonb;
  v_has_plan boolean;
  v_layout text;
  v_sector text;
  v_tier_type text;
begin
  if p_event_id is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object' then
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

  if nullif(btrim(p_payload ->> 'title'), '') is null then
    raise exception 'El título es obligatorio' using errcode = '22023';
  end if;

  begin
    perform (p_payload ->> 'date')::timestamptz;
  exception
    when others then
      raise exception 'Fecha inválida' using errcode = '22007';
  end;

  v_ends_at := null;
  if nullif(btrim(p_payload ->> 'ends_at'), '') is not null then
    begin
      v_ends_at := (p_payload ->> 'ends_at')::timestamptz;
    exception
      when others then
        raise exception 'Fecha de fin inválida' using errcode = '22007';
    end;
  end if;

  v_visibility := lower(coalesce(nullif(btrim(p_payload ->> 'visibility'), ''), 'private'));
  if v_visibility not in ('public', 'private', 'guest_list_only') then
    raise exception 'Visibilidad de evento inválida' using errcode = '22023';
  end if;

  v_refund := coalesce(nullif(btrim(p_payload ->> 'refund_policy'), ''), 'organizer');
  if v_refund not in ('organizer', 'no_refunds', 'until_24h') then
    v_refund := 'organizer';
  end if;

  v_venue_name := nullif(btrim(coalesce(
    p_payload #>> '{venue,name}',
    p_payload ->> 'location'
  )), '');
  v_venue_location := coalesce(
    nullif(btrim(p_payload #>> '{venue,location}'), ''),
    v_venue_name
  );
  v_venue_capacity := coalesce((p_payload #>> '{venue,capacity}')::integer, 0);
  v_venue_city := nullif(btrim(p_payload #>> '{venue,city}'), '');
  v_province := nullif(btrim(coalesce(
    p_payload #>> '{venue,province}',
    p_payload ->> 'province'
  )), '');
  begin
    v_venue_lat := nullif(p_payload #>> '{venue,latitude}', '')::double precision;
  exception
    when others then
      v_venue_lat := null;
  end;
  begin
    v_venue_lng := nullif(p_payload #>> '{venue,longitude}', '')::double precision;
  exception
    when others then
      v_venue_lng := null;
  end;
  v_delivery := upper(coalesce(nullif(btrim(p_payload ->> 'delivery_mode'), ''), 'PRESENCIAL'));
  if v_delivery not in ('PRESENCIAL', 'ONLINE') then
    v_delivery := 'PRESENCIAL';
  end if;
  if v_venue_name is null or v_venue_capacity < 1 then
    raise exception 'El recinto y el aforo son obligatorios' using errcode = '22023';
  end if;

  v_venue_map := case
    when p_payload ? 'venue_map'
         and jsonb_typeof(p_payload -> 'venue_map') = 'object'
      then p_payload -> 'venue_map'
    else null
  end;
  begin
    v_has_plan := coalesce((p_payload ->> 'has_seating_plan')::boolean, false);
  exception
    when others then
      v_has_plan := false;
  end;

  if v_event.venue_id is not null then
    select v.id
      into v_venue_id
    from public.venues as v
    where v.id = v_event.venue_id
      and v.organizer_id = v_event.organizer_id;
  end if;

  if v_venue_id is null then
    select v.id
      into v_venue_id
    from public.venues as v
    where v.organizer_id = v_event.organizer_id
      and v.name = v_venue_name
    order by v.created_at asc, v.id asc
    limit 1;
  end if;

  if v_venue_id is null then
    insert into public.venues (
      organizer_id,
      name,
      location,
      address,
      city,
      latitude,
      longitude,
      capacity,
      max_capacity
    )
    values (
      v_event.organizer_id,
      v_venue_name,
      v_venue_location,
      v_venue_location,
      v_venue_city,
      v_venue_lat,
      v_venue_lng,
      v_venue_capacity,
      v_venue_capacity
    )
    on conflict (organizer_id, name) do update
    set
      location = excluded.location,
      address = excluded.address,
      city = excluded.city,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      capacity = excluded.capacity,
      max_capacity = excluded.max_capacity,
      updated_at = now()
    returning id into v_venue_id;
  else
    begin
      update public.venues
      set
        name = v_venue_name,
        location = v_venue_location,
        address = v_venue_location,
        city = coalesce(v_venue_city, city),
        latitude = coalesce(v_venue_lat, latitude),
        longitude = coalesce(v_venue_lng, longitude),
        capacity = v_venue_capacity,
        max_capacity = v_venue_capacity,
        updated_at = now()
      where id = v_venue_id
        and organizer_id = v_event.organizer_id;
    exception
      when unique_violation then
        select v.id
          into v_venue_id
        from public.venues as v
        where v.organizer_id = v_event.organizer_id
          and v.name = v_venue_name
        order by v.created_at asc, v.id asc
        limit 1;

        update public.venues
        set
          location = v_venue_location,
          address = v_venue_location,
          city = coalesce(v_venue_city, city),
          latitude = coalesce(v_venue_lat, latitude),
          longitude = coalesce(v_venue_lng, longitude),
          capacity = v_venue_capacity,
          max_capacity = v_venue_capacity,
          updated_at = now()
        where id = v_venue_id;
    end;
  end if;

  if v_venue_id is null then
    raise exception 'No se pudo guardar el recinto' using errcode = 'P0002';
  end if;

  if v_venue_map is not null then
    update public.venues
    set
      venue_map = v_venue_map,
      updated_at = now()
    where id = v_venue_id;
  end if;

  if p_payload -> 'tickets' is null
     or jsonb_typeof(p_payload -> 'tickets') <> 'array'
     or jsonb_array_length(p_payload -> 'tickets') = 0 then
    raise exception 'Debes publicar al menos un tipo de entrada'
      using errcode = '22023';
  end if;

  for v_tier in
    select value from jsonb_array_elements(p_payload -> 'tickets')
  loop
    if nullif(btrim(v_tier ->> 'name'), '') is null then
      raise exception 'Cada ticket debe tener un nombre' using errcode = '22023';
    end if;

    v_capacity := coalesce((v_tier ->> 'capacity')::integer, 0);
    if v_capacity < 1 then
      raise exception 'El stock de "%" debe ser mayor a cero', v_tier ->> 'name'
        using errcode = '22023';
    end if;

    begin
      v_tier_id := nullif(btrim(v_tier ->> 'id'), '')::uuid;
    exception
      when others then
        v_tier_id := null;
    end;

    v_layout := case
      when v_tier ->> 'layout_type' in ('numbered_seat', 'table_combo', 'general')
        then v_tier ->> 'layout_type'
      else 'general'
    end;
    v_sector := nullif(btrim(v_tier ->> 'seating_sector_id'), '');
    v_tier_type := case
      when v_tier ->> 'tier_type' in ('general', 'addon', 'seated', 'bundle')
        then v_tier ->> 'tier_type'
      else 'general'
    end;

    v_sold := 0;
    if v_tier_id is not null then
      select tt.sold
        into v_sold
      from public.ticket_tiers as tt
      where tt.id = v_tier_id
        and tt.event_id = p_event_id;

      if found and v_sold > v_capacity then
        raise exception 'La capacidad de "%" no puede ser menor a % entradas vendidas',
          v_tier ->> 'name',
          v_sold
          using errcode = '23514';
      end if;

      if found then
        update public.ticket_tiers
        set
          name = btrim(v_tier ->> 'name'),
          description = nullif(left(btrim(coalesce(v_tier ->> 'description', '')), 180), ''),
          price = coalesce((v_tier ->> 'price')::numeric(12, 2), 0),
          base_price = coalesce((v_tier ->> 'base_price')::numeric(12, 2), 0),
          platform_fee = coalesce((v_tier ->> 'platform_fee')::numeric(12, 2), 0),
          capacity = v_capacity,
          total_capacity = v_capacity,
          min_purchase_limit = greatest(coalesce((v_tier ->> 'min_purchase_limit')::integer, 1), 1),
          max_purchase_limit = nullif((v_tier ->> 'max_purchase_limit')::integer, 0),
          tier_type = v_tier_type,
          layout_type = v_layout,
          seating_sector_id = v_sector,
          visibility = 'public',
          updated_at = now()
        where id = v_tier_id
          and event_id = p_event_id;

        v_seen_tier_ids := array_append(v_seen_tier_ids, v_tier_id);
        continue;
      end if;

      if exists (
        select 1
        from public.ticket_tiers as tt
        where tt.id = v_tier_id
          and tt.event_id is distinct from p_event_id
      ) then
        v_tier_id := null;
      end if;
    end if;

    insert into public.ticket_tiers (
      id,
      event_id,
      name,
      description,
      price,
      base_price,
      platform_fee,
      capacity,
      total_capacity,
      sold,
      visibility,
      layout_type,
      seating_sector_id,
      capacity_per_unit,
      admit_count,
      min_purchase_limit,
      max_purchase_limit,
      tier_type,
      bundle_items
    )
    values (
      coalesce(v_tier_id, gen_random_uuid()),
      p_event_id,
      btrim(v_tier ->> 'name'),
      nullif(left(btrim(coalesce(v_tier ->> 'description', '')), 180), ''),
      coalesce((v_tier ->> 'price')::numeric(12, 2), 0),
      coalesce((v_tier ->> 'base_price')::numeric(12, 2), 0),
      coalesce((v_tier ->> 'platform_fee')::numeric(12, 2), 0),
      v_capacity,
      v_capacity,
      0,
      'public',
      v_layout,
      v_sector,
      1,
      1,
      greatest(coalesce((v_tier ->> 'min_purchase_limit')::integer, 1), 1),
      nullif((v_tier ->> 'max_purchase_limit')::integer, 0),
      v_tier_type,
      '[]'::jsonb
    )
    returning id into v_tier_id;

    v_seen_tier_ids := array_append(v_seen_tier_ids, v_tier_id);
  end loop;

  if exists (
    select 1
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id
      and tt.tier_type in ('general', 'addon', 'seated')
      and not (tt.id = any (v_seen_tier_ids))
      and tt.sold > 0
  ) then
    raise exception 'No podés quitar un ticket con entradas vendidas'
      using errcode = '23514';
  end if;

  delete from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.tier_type in ('general', 'addon', 'seated')
    and not (tt.id = any (v_seen_tier_ids))
    and tt.sold = 0;

  v_flyer := nullif(btrim(p_payload ->> 'flyer_url'), '');
  v_banner := nullif(btrim(p_payload ->> 'social_share_image_url'), '');

  update public.events
  set
    title = btrim(p_payload ->> 'title'),
    description = coalesce(
      nullif(btrim(p_payload ->> 'description'), ''),
      btrim(p_payload ->> 'title')
    ),
    date = (p_payload ->> 'date')::timestamptz,
    ends_at = v_ends_at,
    location = coalesce(
      nullif(btrim(p_payload ->> 'location'), ''),
      v_venue_location
    ),
    province = coalesce(v_province, province),
    department = coalesce(v_venue_city, department),
    delivery_mode = v_delivery::public.event_delivery_mode,
    visibility = v_visibility,
    flyer_url = coalesce(v_flyer, flyer_url),
    image_url = coalesce(
      nullif(btrim(p_payload ->> 'image_url'), ''),
      v_flyer,
      image_url
    ),
    social_share_image_url = coalesce(v_banner, social_share_image_url),
    refund_policy = v_refund,
    venue_id = v_venue_id,
    venue_map = case
      when v_venue_map is not null then v_venue_map
      else venue_map
    end,
    has_seating_plan = v_has_plan,
    status = 'published',
    draft_state = null,
    updated_at = now()
  where id = p_event_id;

  if v_has_plan then
    perform public.materialize_event_seating_units(p_event_id);
  end if;

  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'venue_id', v_venue_id
  );
end;
$$;

revoke all on function public.publish_event_v2(uuid, jsonb) from public;
revoke all on function public.publish_event_v2(uuid, jsonb) from anon;
grant execute on function public.publish_event_v2(uuid, jsonb)
  to authenticated, service_role;

comment on function public.publish_event_v2(uuid, jsonb) is
  'Event Creator V2: unpacks draft JSON into events/venues/ticket_tiers. Leaves ticket_tiers.category on its ENUM default.';
