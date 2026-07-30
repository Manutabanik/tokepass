-- =============================================================================
-- P10 - Secure, atomic event editing
-- =============================================================================

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
  v_new_flyer text;
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

  if v_existing_venue_id is not null then
    select v.id
      into v_venue_id
    from public.venues as v
    where v.id = v_existing_venue_id
      and v.organizer_id = v_event.organizer_id;

    if v_venue_id is null then
      raise exception 'Recinto no encontrado o ajeno' using errcode = '42501';
    end if;
  else
    if nullif(btrim(payload #>> '{venue,name}'), '') is null then
      raise exception 'El nombre del recinto es obligatorio'
        using errcode = '22023';
    end if;

    v_capacity := coalesce((payload #>> '{venue,capacity}')::integer, 0);
    if v_capacity < 1 then
      raise exception 'La capacidad del recinto debe ser mayor a cero'
        using errcode = '22023';
    end if;

    insert into public.venues (
      organizer_id,
      name,
      location,
      city,
      capacity,
      zone_blueprint
    )
    values (
      v_event.organizer_id,
      btrim(payload #>> '{venue,name}'),
      coalesce(
        nullif(btrim(payload #>> '{venue,location}'), ''),
        btrim(payload #>> '{venue,name}')
      ),
      nullif(btrim(payload #>> '{venue,city}'), ''),
      v_capacity,
      coalesce(payload -> 'zones', '[]'::jsonb)
    )
    returning id into v_venue_id;
  end if;

  v_new_flyer := coalesce(
    nullif(btrim(payload ->> 'flyer_url'), ''),
    nullif(btrim(payload ->> 'image_url'), ''),
    v_event.flyer_url,
    v_event.image_url
  );

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
    updated_at = now()
  where id = p_event_id;

  if payload -> 'tiers' is null
     or jsonb_typeof(payload -> 'tiers') <> 'array'
     or jsonb_array_length(payload -> 'tiers') = 0 then
    raise exception 'Debes mantener al menos un tipo de entrada'
      using errcode = '22023';
  end if;

  select ez.id
    into v_zone_id
  from public.event_zones as ez
  where ez.event_id = p_event_id
  order by ez.created_at
  limit 1;

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

    -- Server-calculated split is authoritative.
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

    if v_tier_id is not null then
      update public.ticket_tiers
      set
        name = btrim(v_tier ->> 'name'),
        base_price = v_base_price,
        platform_fee = v_platform_fee,
        price = v_public_price,
        capacity = v_capacity,
        time_limit = v_time_limit,
        bonus_reward = nullif(btrim(v_tier ->> 'bonus_reward'), ''),
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
        zone_id
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
        v_zone_id
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
  'Actualiza evento, venue y tiers atómicamente; preserva capacidad >= sold.';
