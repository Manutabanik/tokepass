-- =============================================================================
-- P12 - Universal Event Engine
-- Multi-day schedule_days, event/tier visibility, ticket day_id binding
-- =============================================================================

alter table public.events
  add column if not exists schedule_days jsonb not null default '[]'::jsonb,
  add column if not exists visibility text not null default 'public';

alter table public.events
  drop constraint if exists events_visibility_check;
alter table public.events
  add constraint events_visibility_check
  check (visibility in ('public', 'private', 'guest_list_only'));

alter table public.ticket_tiers
  add column if not exists day_id text,
  add column if not exists visibility text not null default 'public';

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_visibility_check;
alter table public.ticket_tiers
  add constraint ticket_tiers_visibility_check
  check (visibility in ('public', 'private'));

comment on column public.events.schedule_days is
  'Jornadas del evento: [{id,title,start_time,end_time}, ...]. Vacío = fecha única en events.date.';
comment on column public.events.visibility is
  'public = catálogo B2C; private = solo enlace; guest_list_only = oculto + invitados.';
comment on column public.ticket_tiers.day_id is
  'NULL/all = abono completo o evento de una fecha; si no, id de schedule_days.';
comment on column public.ticket_tiers.visibility is
  'public = storefront; private = RRPP / enlace exclusivo.';

create index if not exists events_visibility_status_date_idx
  on public.events (visibility, status, date);


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

    insert into public.venues (organizer_id, name, location, capacity)
    values (p_organizer_id, v_venue_name, v_venue_location, v_venue_capacity)
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

    if coalesce((v_tier ->> 'capacity')::integer, 0) < 1 then
      raise exception 'La capacidad del tier "%" debe ser mayor a cero',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    if coalesce((v_tier ->> 'price')::numeric, -1) < 0 then
      raise exception 'El precio del tier "%" no puede ser negativo',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    -- Prefer explicit base/fee/public from payload; otherwise treat price as public
    -- and reverse-split, or treat base_price as net.
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
      (v_tier ->> 'capacity')::integer,
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
revoke all on function public.update_complete_event_tx(uuid, jsonb) from public;
revoke all on function public.update_complete_event_tx(uuid, jsonb) from anon;
grant execute on function public.update_complete_event_tx(uuid, jsonb)
  to authenticated, service_role;

comment on function public.update_complete_event_tx(uuid, jsonb) is
  'Actualiza evento, venue y tiers atómicamente; Universal Event Engine: schedule_days, visibility, day_id.';

