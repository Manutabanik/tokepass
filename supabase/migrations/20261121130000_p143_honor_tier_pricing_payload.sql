-- =============================================================================
-- P143 - Honor explicit All-In amounts on event update
-- =============================================================================
-- update_complete_event_tx used to rebuild price from base_price * (1 + rate).
-- The flexible pricing simulator persists price / base_price / platform_fee
-- and those values must survive the RPC (same rule as create_complete_event_tx).
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
  v_total_capacity integer;
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
  v_day_id uuid;
  v_tier_visibility text;
  v_ends_at timestamptz;
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

  v_ends_at := v_event.ends_at;
  if payload ? 'ends_at' then
    begin
      v_ends_at := nullif(btrim(payload ->> 'ends_at'), '')::timestamptz;
    exception
      when others then
        v_ends_at := v_event.ends_at;
    end;
  end if;

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
    ends_at = v_ends_at,
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

    begin
      v_total_capacity := nullif((v_tier ->> 'total_capacity')::integer, 0);
    exception
      when others then
        v_total_capacity := null;
    end;
    v_total_capacity := coalesce(v_total_capacity, v_capacity);

    if v_tier ? 'base_price' then
      v_base_price := coalesce((v_tier ->> 'base_price')::numeric(12, 2), 0);
      v_public_price := coalesce(
        (v_tier ->> 'price')::numeric(12, 2),
        public.all_in_public_price(v_base_price, v_rate)
      );
      v_platform_fee := coalesce(
        (v_tier ->> 'platform_fee')::numeric(12, 2),
        round(v_public_price - v_base_price, 2)
      );
    else
      v_public_price := coalesce((v_tier ->> 'price')::numeric(12, 2), 0);
      v_base_price := round(v_public_price / (1 + v_rate), 2);
      v_platform_fee := round(v_public_price - v_base_price, 2);
    end if;

    if v_base_price < 0 or v_platform_fee < 0 or v_public_price < 0 then
      raise exception 'Montos del tier "%" inválidos', v_tier ->> 'name'
        using errcode = '22023';
    end if;

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
    v_day_id := public.resolve_event_day_id(p_event_id, v_tier ->> 'day_id');

    v_tier_visibility := lower(coalesce(nullif(btrim(v_tier ->> 'visibility'), ''), 'public'));
    if v_tier_visibility not in ('public', 'private') then
      raise exception 'Visibilidad de entrada inválida en "%"', v_tier ->> 'name'
        using errcode = '22023';
    end if;

    if v_tier_id is not null then
      update public.ticket_tiers
      set
        name = btrim(v_tier ->> 'name'),
        base_price = v_base_price,
        platform_fee = v_platform_fee,
        price = v_public_price,
        capacity = v_capacity,
        total_capacity = v_total_capacity,
        time_limit = v_time_limit,
        bonus_reward = nullif(btrim(v_tier ->> 'bonus_reward'), ''),
        day_id = v_day_id,
        visibility = v_tier_visibility,
        zone_id = v_zone_id,
        seating_sector_id = v_seating_sector_id,
        updated_at = now()
      where id = v_tier_id
        and event_id = p_event_id
        and sold <= v_total_capacity;

      if not found then
        if exists (
          select 1
          from public.ticket_tiers as tt
          where tt.id = v_tier_id
            and tt.event_id = p_event_id
            and tt.sold > v_total_capacity
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
        total_capacity,
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
        v_total_capacity,
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
  'Actualiza evento y tiers. Honra price/base_price/platform_fee del payload.';
