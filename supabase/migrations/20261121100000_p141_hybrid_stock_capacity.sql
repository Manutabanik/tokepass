-- =============================================================================
-- Tokepass · P141 · Arquitectura hibrida de stock
--
-- 1) Trigger: si total_capacity llega 0/NULL y capacity > 0, hereda capacity.
-- 2) RPCs create/update: persisten total_capacity del JSON (fallback: capacity).
-- 3) Live stock: el techo de venues.max_capacity solo aplica con mapa de
--    butacas o cuando el recinto declara un tope explicito (> 1).
-- No altera materializacion de asientos numerados.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger ticket_tiers_sync_total_capacity
-- ---------------------------------------------------------------------------
create or replace function public.sync_ticket_tier_total_capacity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- INSERT o UPDATE: no pisar un capacity valido con el default 0 de total_capacity.
  if (new.total_capacity is null or new.total_capacity = 0)
     and coalesce(new.capacity, 0) > 0 then
    new.total_capacity := new.capacity;
  end if;

  new.total_capacity := greatest(0, coalesce(new.total_capacity, new.capacity, 0));
  new.capacity := new.total_capacity;

  if new.sold > new.total_capacity then
    raise exception 'El vendido del tier supera total_capacity'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.sync_ticket_tier_total_capacity() is
  'Sincroniza capacity y total_capacity. Si total_capacity es 0/NULL y capacity > 0, hereda capacity.';

-- Filas ya persistidas donde capacity sobrevivio y total_capacity quedo en 0.
update public.ticket_tiers
set
  total_capacity = capacity
where coalesce(total_capacity, 0) = 0
  and coalesce(capacity, 0) > 0;

-- Recintos con aforo real en capacity pero techo default 1 en max_capacity.
update public.venues
set max_capacity = capacity
where coalesce(max_capacity, 0) <= 1
  and coalesce(capacity, 0) > 1;

-- ---------------------------------------------------------------------------
-- 2. create_complete_event_tx — persistir total_capacity
-- Cuerpo vigente: P12. Solo se agrega lectura/escritura de total_capacity.
-- ---------------------------------------------------------------------------
create or replace function public.create_complete_event_tx(
  payload jsonb,
  p_organizer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
  v_event_id uuid;
  v_zone_id uuid;
  v_zone_ids uuid[] := '{}';
  v_zone jsonb;
  v_tier jsonb;
  v_zone_index integer;
  v_zone_type public.zone_type;
  v_zone_capacity integer;
  v_rows integer;
  v_seats_per_row integer;
  v_row_idx integer;
  v_seat_idx integer;
  v_row_label text;
  v_venue_name text;
  v_venue_location text;
  v_venue_capacity integer;
  v_title text;
  v_description text;
  v_date timestamptz;
  v_location text;
  v_image_url text;
  v_time_limit time;
  v_bonus_reward text;
  v_existing_venue_id uuid;
  v_rate numeric(5, 4) := 0.15;
  v_base_price numeric(12, 2);
  v_platform_fee numeric(12, 2);
  v_public_price numeric(12, 2);
  v_visibility text;
  v_schedule_days jsonb;
  v_day_id text;
  v_tier_visibility text;
  v_capacity integer;
  v_total_capacity integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id) then
    raise exception 'Forbidden: no puedes crear eventos en nombre de otro usuario'
      using errcode = '42501';
  end if;

  if not public.is_approved_organizer(p_organizer_id) then
    raise exception
      'Forbidden: el organizador no está aprobado o no tiene permisos de productor'
      using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = p_organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  v_title := nullif(btrim(payload ->> 'title'), '');
  v_description := nullif(btrim(payload ->> 'description'), '');
  v_location := nullif(btrim(payload ->> 'location'), '');
  v_image_url := coalesce(
    nullif(btrim(payload ->> 'flyer_url'), ''),
    nullif(btrim(payload ->> 'image_url'), '')
  );

  begin
    v_date := (payload ->> 'date')::timestamptz;
  exception
    when others then
      raise exception 'Fecha del evento inválida'
        using errcode = '22007';
  end;

  if v_title is null then
    raise exception 'El título del evento es obligatorio'
      using errcode = '22023';
  end if;

  if v_date is null then
    raise exception 'La fecha del evento es obligatoria'
      using errcode = '22023';
  end if;

  v_visibility := lower(coalesce(nullif(btrim(payload ->> 'visibility'), ''), 'public'));
  if v_visibility not in ('public', 'private', 'guest_list_only') then
    raise exception 'Visibilidad de evento inválida'
      using errcode = '22023';
  end if;

  v_schedule_days := coalesce(payload -> 'schedule_days', '[]'::jsonb);
  if jsonb_typeof(v_schedule_days) <> 'array' then
    raise exception 'schedule_days debe ser un arreglo JSON'
      using errcode = '22023';
  end if;

  begin
    v_existing_venue_id := nullif(btrim(payload ->> 'venue_id'), '')::uuid;
  exception
    when others then
      raise exception 'venue_id inválido' using errcode = '22P02';
  end;

  if v_existing_venue_id is not null then
    select v.id, v.name, v.location, v.capacity
      into v_venue_id, v_venue_name, v_venue_location, v_venue_capacity
    from public.venues as v
    where v.id = v_existing_venue_id
      and v.organizer_id = p_organizer_id;

    if v_venue_id is null then
      raise exception 'Recinto no encontrado o no pertenece al organizador'
        using errcode = '42501';
    end if;
  else
    v_venue_name := nullif(btrim(payload #>> '{venue,name}'), '');
    v_venue_location := coalesce(
      nullif(btrim(payload #>> '{venue,location}'), ''),
      v_venue_name,
      v_location
    );
    v_venue_capacity := coalesce((payload #>> '{venue,capacity}')::integer, 0);

    if v_venue_name is null then
      raise exception 'El nombre del recinto es obligatorio'
        using errcode = '22023';
    end if;

    if v_venue_capacity <= 0 then
      raise exception 'La capacidad del recinto debe ser mayor a cero'
        using errcode = '22023';
    end if;

    insert into public.venues (organizer_id, name, location, capacity, max_capacity)
    values (
      p_organizer_id,
      v_venue_name,
      v_venue_location,
      v_venue_capacity,
      v_venue_capacity
    )
    returning id into v_venue_id;
  end if;

  if v_location is null then
    v_location := v_venue_location;
  end if;

  if payload -> 'zones' is null
     or jsonb_typeof(payload -> 'zones') <> 'array'
     or jsonb_array_length(payload -> 'zones') = 0 then
    raise exception 'Debes definir al menos una zona'
      using errcode = '22023';
  end if;

  if payload -> 'tiers' is null
     or jsonb_typeof(payload -> 'tiers') <> 'array'
     or jsonb_array_length(payload -> 'tiers') = 0 then
    raise exception 'Debes definir al menos un tipo de entrada'
      using errcode = '22023';
  end if;

  insert into public.events (
    organizer_id,
    title,
    description,
    date,
    location,
    image_url,
    flyer_url,
    venue_id,
    status,
    visibility,
    schedule_days
  )
  values (
    p_organizer_id,
    v_title,
    v_description,
    v_date,
    coalesce(v_location, v_venue_location, v_venue_name),
    v_image_url,
    v_image_url,
    v_venue_id,
    'draft'::public.event_status,
    v_visibility,
    v_schedule_days
  )
  returning id into v_event_id;

  for v_zone in select value from jsonb_array_elements(payload -> 'zones')
  loop
    begin
      v_zone_type := (v_zone ->> 'type')::public.zone_type;
    exception
      when others then
        raise exception 'Tipo de zona inválido: %', v_zone ->> 'type'
          using errcode = '22P02';
    end;

    v_zone_capacity := coalesce((v_zone ->> 'capacity')::integer, 0);

    if nullif(btrim(v_zone ->> 'name'), '') is null then
      raise exception 'Cada zona debe tener un nombre' using errcode = '22023';
    end if;

    if v_zone_capacity <= 0 then
      raise exception 'La capacidad de la zona "%" debe ser mayor a cero',
        v_zone ->> 'name' using errcode = '22023';
    end if;

    insert into public.event_zones (event_id, name, type, capacity)
    values (v_event_id, btrim(v_zone ->> 'name'), v_zone_type, v_zone_capacity)
    returning id into v_zone_id;

    v_zone_ids := array_append(v_zone_ids, v_zone_id);

    if v_zone_type = 'reserved_seating'::public.zone_type then
      v_rows := coalesce((v_zone ->> 'rows')::integer, 0);
      v_seats_per_row := coalesce((v_zone ->> 'seats_per_row')::integer, 0);

      if v_rows <= 0 or v_seats_per_row <= 0 then
        raise exception 'La zona "%" requiere filas y asientos por fila',
          v_zone ->> 'name' using errcode = '22023';
      end if;

      if (v_rows * v_seats_per_row) > 5000 then
        raise exception 'La zona "%" supera el máximo de 5000 asientos por creación',
          v_zone ->> 'name' using errcode = '22023';
      end if;

      for v_row_idx in 1..v_rows loop
        if v_row_idx <= 26 then
          v_row_label := chr(64 + v_row_idx);
        else
          v_row_label :=
            chr(64 + ((v_row_idx - 1) / 26))
            || chr(65 + ((v_row_idx - 1) % 26));
        end if;

        for v_seat_idx in 1..v_seats_per_row loop
          insert into public.seats (zone_id, row_label, seat_number, status)
          values (
            v_zone_id,
            v_row_label,
            v_seat_idx::text,
            'available'::public.seat_status
          );
        end loop;
      end loop;
    end if;
  end loop;

  for v_tier in select value from jsonb_array_elements(payload -> 'tiers')
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

    if coalesce((v_tier ->> 'price')::numeric, -1) < 0 then
      raise exception 'El precio del tier "%" no puede ser negativo',
        v_tier ->> 'name' using errcode = '22023';
    end if;

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

    v_zone_index := coalesce((v_tier ->> 'zone_index')::integer, 0);
    v_zone_id := null;

    if v_zone_index >= 0 and v_zone_index < cardinality(v_zone_ids) then
      v_zone_id := v_zone_ids[v_zone_index + 1];
    end if;

    v_time_limit := null;
    if nullif(btrim(v_tier ->> 'time_limit'), '') is not null then
      begin
        v_time_limit := (v_tier ->> 'time_limit')::time;
      exception
        when others then
          raise exception 'time_limit inválido en tier "%"', v_tier ->> 'name'
            using errcode = '22007';
      end;
    end if;

    v_bonus_reward := nullif(btrim(v_tier ->> 'bonus_reward'), '');

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
      total_capacity,
      sold,
      time_limit,
      bonus_reward,
      zone_id,
      day_id,
      visibility
    )
    values (
      v_event_id,
      btrim(v_tier ->> 'name'),
      v_public_price,
      v_base_price,
      v_platform_fee,
      v_capacity,
      v_total_capacity,
      0,
      v_time_limit,
      v_bonus_reward,
      v_zone_id,
      v_day_id,
      v_tier_visibility
    );
  end loop;

  return v_event_id;

exception
  when others then
    raise exception 'create_complete_event_tx: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

comment on function public.create_complete_event_tx(jsonb, uuid) is
  'Crea evento, zonas y tiers. Persiste total_capacity del payload (fallback: capacity).';

-- ---------------------------------------------------------------------------
-- 3. update_complete_event_tx — persistir total_capacity
-- Cuerpo vigente: P111. Solo se agrega lectura/escritura de total_capacity.
-- ---------------------------------------------------------------------------
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
  'Actualiza evento y tiers. Persiste total_capacity del payload (fallback: capacity).';

-- ---------------------------------------------------------------------------
-- 4. get_event_tier_live_stock — techo de recinto solo con mapa o tope > 1
-- ---------------------------------------------------------------------------
create or replace function public.get_event_tier_live_stock(p_event_id uuid)
returns table (
  tier_id uuid,
  capacity integer,
  sold integer,
  available integer,
  venue_remaining integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_venue_id uuid;
  v_venue_cap integer := null;
  v_has_seating_plan boolean := false;
begin
  if not public.event_uses_live_stock(p_event_id) then
    return query
    select
      tt.id,
      coalesce(tt.total_capacity, tt.capacity)::integer,
      0::integer,
      coalesce(tt.total_capacity, tt.capacity)::integer,
      coalesce(tt.total_capacity, tt.capacity)::integer
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id;
    return;
  end if;

  select
    e.venue_id,
    coalesce(e.has_seating_plan, false)
    into v_venue_id, v_has_seating_plan
  from public.events as e
  where e.id = p_event_id;

  -- Evento simple (sin mapa): stock = capacity - sold. No aplicar el default
  -- venues.max_capacity = 1. Si el recinto declara un tope explicito (> 1)
  -- o el evento tiene plano de butacas, si se aplica el techo fisico.
  if v_venue_id is not null then
    select coalesce(v.max_capacity, v.capacity)
      into v_venue_cap
    from public.venues as v
    where v.id = v_venue_id;

    if not v_has_seating_plan and coalesce(v_venue_cap, 0) <= 1 then
      v_venue_cap := null;
    end if;
  end if;

  return query
  with sku as (
    select
      tt.id,
      tt.day_id,
      tt.tier_type,
      coalesce(tt.total_capacity, tt.capacity)::integer as capacity,
      greatest(
        0,
        tt.sold - coalesce(expired.qty, 0)
      )::integer as sold
    from public.ticket_tiers as tt
    left join lateral (
      select coalesce(sum(h.quantity), 0)::integer as qty
      from public.event_ga_cart_holds as h
      where h.tier_id = tt.id
        and h.reserved_until <= clock_timestamp()
    ) as expired on true
    where tt.event_id = p_event_id
  )
  select
    sku.id,
    sku.capacity,
    sku.sold,
    greatest(
      0,
      least(
        sku.capacity - sku.sold,
        case
          when v_venue_cap is null then sku.capacity - sku.sold
          when sku.tier_type = 'addon' then sku.capacity - sku.sold
          when public.ticket_day_is_full_pass(sku.day_id) then
            coalesce(
              (
                select min(
                  greatest(
                    0,
                    v_venue_cap
                      - public.event_occupied_day_units(p_event_id, d.day_id)
                  )
                )
                from public.event_schedule_day_ids(p_event_id) as d
              ),
              greatest(
                0,
                v_venue_cap - public.event_occupied_venue_units(p_event_id)
              )
            )
          else
            greatest(
              0,
              v_venue_cap
                - public.event_occupied_day_units(
                    p_event_id,
                    sku.day_id::text
                  )
            )
        end
      )
    )::integer as available,
    case
      when v_venue_cap is null then null
      when sku.tier_type = 'addon' then null
      when public.ticket_day_is_full_pass(sku.day_id) then
        coalesce(
          (
            select min(
              greatest(
                0,
                v_venue_cap
                  - public.event_occupied_day_units(p_event_id, d.day_id)
              )
            )
            from public.event_schedule_day_ids(p_event_id) as d
          ),
          greatest(
            0,
            v_venue_cap - public.event_occupied_venue_units(p_event_id)
          )
        )
      else
        greatest(
          0,
          v_venue_cap
            - public.event_occupied_day_units(p_event_id, sku.day_id::text)
        )
    end::integer as venue_remaining
  from sku;
end;
$$;

revoke all on function public.get_event_tier_live_stock(uuid) from public;
grant execute on function public.get_event_tier_live_stock(uuid)
  to anon, authenticated, service_role;

comment on function public.get_event_tier_live_stock(uuid) is
  'Stock vivo por SKU. El techo de recinto solo aplica con has_seating_plan o max_capacity > 1.';
