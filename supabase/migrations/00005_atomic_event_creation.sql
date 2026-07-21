-- =============================================================================
-- Tokepass - Creación atómica del grafo de evento (Smart Wizard)
-- =============================================================================
-- Una sola transacción: venue → event → zones → seats → tiers → promoter base.
-- Cualquier fallo hace rollback completo (sin datos huérfanos).
-- =============================================================================

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
  v_rrpp_commission numeric(5, 2);
  v_time_limit time;
  v_bonus_reward text;
  v_custom_link text;
begin
  --------------------------------------------------------------------
  -- Autorización: solo el propio organizador (o service_role).
  --------------------------------------------------------------------
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id) then
    raise exception 'Forbidden: no puedes crear eventos en nombre de otro usuario'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = p_organizer_id
      and profiles.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Forbidden: el organizador no tiene permisos de productor'
      using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  --------------------------------------------------------------------
  -- Parseo del payload
  --------------------------------------------------------------------
  v_title := nullif(btrim(payload ->> 'title'), '');
  v_description := nullif(btrim(payload ->> 'description'), '');
  v_location := nullif(btrim(payload ->> 'location'), '');
  v_image_url := nullif(btrim(payload ->> 'image_url'), '');

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

  --------------------------------------------------------------------
  -- 1) Venue
  --------------------------------------------------------------------
  insert into public.venues (
    organizer_id,
    name,
    location,
    capacity
  )
  values (
    p_organizer_id,
    v_venue_name,
    v_venue_location,
    v_venue_capacity
  )
  returning id into v_venue_id;

  --------------------------------------------------------------------
  -- 2) Event (draft)
  --------------------------------------------------------------------
  insert into public.events (
    organizer_id,
    title,
    description,
    date,
    location,
    image_url,
    venue_id,
    status
  )
  values (
    p_organizer_id,
    v_title,
    v_description,
    v_date,
    v_location,
    v_image_url,
    v_venue_id,
    'draft'::public.event_status
  )
  returning id into v_event_id;

  --------------------------------------------------------------------
  -- 3) Zones (+ seats si reserved_seating)
  --------------------------------------------------------------------
  for v_zone in
    select value
    from jsonb_array_elements(payload -> 'zones')
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
      raise exception 'Cada zona debe tener un nombre'
        using errcode = '22023';
    end if;

    if v_zone_capacity <= 0 then
      raise exception 'La capacidad de la zona "%" debe ser mayor a cero',
        v_zone ->> 'name'
        using errcode = '22023';
    end if;

    insert into public.event_zones (
      event_id,
      name,
      type,
      capacity
    )
    values (
      v_event_id,
      btrim(v_zone ->> 'name'),
      v_zone_type,
      v_zone_capacity
    )
    returning id into v_zone_id;

    v_zone_ids := array_append(v_zone_ids, v_zone_id);

    if v_zone_type = 'reserved_seating'::public.zone_type then
      v_rows := coalesce((v_zone ->> 'rows')::integer, 0);
      v_seats_per_row := coalesce((v_zone ->> 'seats_per_row')::integer, 0);

      if v_rows <= 0 or v_seats_per_row <= 0 then
        raise exception
          'La zona "%" requiere filas y asientos por fila',
          v_zone ->> 'name'
          using errcode = '22023';
      end if;

      if (v_rows * v_seats_per_row) > 5000 then
        raise exception
          'La zona "%" supera el máximo de 5000 asientos por creación',
          v_zone ->> 'name'
          using errcode = '22023';
      end if;

      for v_row_idx in 1..v_rows loop
        -- Etiquetas A, B, ... Z, AA, AB...
        if v_row_idx <= 26 then
          v_row_label := chr(64 + v_row_idx);
        else
          v_row_label :=
            chr(64 + ((v_row_idx - 1) / 26))
            || chr(65 + ((v_row_idx - 1) % 26));
        end if;

        for v_seat_idx in 1..v_seats_per_row loop
          insert into public.seats (
            zone_id,
            row_label,
            seat_number,
            status
          )
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

  --------------------------------------------------------------------
  -- 4) Ticket tiers (opcionalmente ligados a zone_index)
  --------------------------------------------------------------------
  for v_tier in
    select value
    from jsonb_array_elements(payload -> 'tiers')
  loop
    if nullif(btrim(v_tier ->> 'name'), '') is null then
      raise exception 'Cada tier debe tener un nombre'
        using errcode = '22023';
    end if;

    if coalesce((v_tier ->> 'capacity')::integer, 0) < 1 then
      raise exception 'La capacidad del tier "%" debe ser mayor a cero',
        v_tier ->> 'name'
        using errcode = '22023';
    end if;

    if coalesce((v_tier ->> 'price')::numeric, -1) < 0 then
      raise exception 'El precio del tier "%" no puede ser negativo',
        v_tier ->> 'name'
        using errcode = '22023';
    end if;

    v_zone_index := coalesce((v_tier ->> 'zone_index')::integer, 0);
    v_zone_id := null;

    if v_zone_index >= 0 and v_zone_index < cardinality(v_zone_ids) then
      v_zone_id := v_zone_ids[v_zone_index + 1]; -- arrays PG son 1-based
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

    insert into public.ticket_tiers (
      event_id,
      name,
      price,
      capacity,
      sold,
      time_limit,
      bonus_reward,
      zone_id
    )
    values (
      v_event_id,
      btrim(v_tier ->> 'name'),
      (v_tier ->> 'price')::numeric(12, 2),
      (v_tier ->> 'capacity')::integer,
      0,
      v_time_limit,
      v_bonus_reward,
      v_zone_id
    );
  end loop;

  --------------------------------------------------------------------
  -- 5) RRPP: configuración base (organizador como promoter inicial)
  --------------------------------------------------------------------
  if payload ? 'rrpp_commission'
     and payload ->> 'rrpp_commission' is not null
     and btrim(payload ->> 'rrpp_commission') <> '' then
    begin
      v_rrpp_commission := (payload ->> 'rrpp_commission')::numeric(5, 2);
    exception
      when others then
        raise exception 'rrpp_commission inválida'
          using errcode = '22023';
    end;

    if v_rrpp_commission < 0 or v_rrpp_commission > 100 then
      raise exception 'rrpp_commission debe estar entre 0 y 100'
        using errcode = '22023';
    end if;

    v_custom_link := 'event-' || replace(v_event_id::text, '-', '');

    insert into public.promoters (
      event_id,
      profile_id,
      commission_percentage,
      custom_link
    )
    values (
      v_event_id,
      p_organizer_id,
      v_rrpp_commission,
      v_custom_link
    );
  end if;

  return v_event_id;

exception
  when others then
    -- Cualquier error aborta la transacción completa (rollback automático).
    raise exception 'create_complete_event_tx: %', sqlerrm
      using errcode = sqlstate;
end;
$$;

comment on function public.create_complete_event_tx(jsonb, uuid) is
  'Crea de forma atómica venue, event (draft), zones, seats, tiers y promoter RRPP base.';

revoke all on function public.create_complete_event_tx(jsonb, uuid) from public;
revoke all on function public.create_complete_event_tx(jsonb, uuid) from anon;
grant execute on function public.create_complete_event_tx(jsonb, uuid)
  to authenticated, service_role;
