-- P96: el update atómico no debe INSERT de venues en cada autoguardado.
-- Upsert por venue_id, events.venue_id o nombre exacto del organizador.

update public.venues
set name = btrim(name)
where name is distinct from btrim(name);

with ranked as (
  select
    id,
    organizer_id,
    name,
    row_number() over (
      partition by organizer_id, name
      order by created_at asc, id asc
    ) as rn
  from public.venues
),
keepers as (
  select id, organizer_id, name
  from ranked
  where rn = 1
),
dupes as (
  select r.id, r.organizer_id, r.name, k.id as keeper_id
  from ranked as r
  join keepers as k
    on k.organizer_id = r.organizer_id
   and k.name = r.name
  where r.rn > 1
)
update public.events as e
set venue_id = d.keeper_id
from dupes as d
where e.venue_id = d.id;

with ranked as (
  select
    id,
    organizer_id,
    name,
    row_number() over (
      partition by organizer_id, name
      order by created_at asc, id asc
    ) as rn
  from public.venues
),
keepers as (
  select id, organizer_id, name
  from ranked
  where rn = 1
),
dupes as (
  select r.id, k.id as keeper_id
  from ranked as r
  join keepers as k
    on k.organizer_id = r.organizer_id
   and k.name = r.name
  where r.rn > 1
)
update public.event_seating_units as u
set venue_id = d.keeper_id
from dupes as d
where u.venue_id = d.id;

with ranked as (
  select
    id,
    row_number() over (
      partition by organizer_id, name
      order by created_at asc, id asc
    ) as rn
  from public.venues
)
delete from public.venues as v
using ranked as r
where v.id = r.id
  and r.rn > 1;

create unique index if not exists venues_organizer_exact_name_key
  on public.venues (organizer_id, name);

create or replace function public.resolve_event_venue_id_for_update(
  p_organizer_id uuid,
  p_linked_venue_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
  v_existing uuid;
  v_name text;
begin
  begin
    v_existing := nullif(btrim(payload ->> 'venue_id'), '')::uuid;
  exception
    when others then
      raise exception 'venue_id inválido' using errcode = '22P02';
  end;

  if v_existing is not null then
    select v.id
      into v_venue_id
    from public.venues as v
    where v.id = v_existing
      and v.organizer_id = p_organizer_id;
    if v_venue_id is null then
      raise exception 'Recinto no encontrado o ajeno' using errcode = '42501';
    end if;
    return v_venue_id;
  end if;

  if p_linked_venue_id is not null then
    select v.id
      into v_venue_id
    from public.venues as v
    where v.id = p_linked_venue_id
      and v.organizer_id = p_organizer_id;
    if v_venue_id is not null then
      return v_venue_id;
    end if;
  end if;

  v_name := nullif(btrim(payload #>> '{venue,name}'), '');
  if v_name is not null and lower(v_name) <> 'por definir' then
    select v.id
      into v_venue_id
    from public.venues as v
    where v.organizer_id = p_organizer_id
      and v.name = v_name
    order by v.created_at asc, v.id asc
    limit 1;
    if v_venue_id is not null then
      return v_venue_id;
    end if;
  end if;

  -- Autoguardado: no crear recintos nuevos. El alta es explícita (Guardar recinto).
  return null;
end;
$$;

revoke all on function public.resolve_event_venue_id_for_update(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.resolve_event_venue_id_for_update(uuid, uuid, jsonb)
  to authenticated, service_role;

comment on function public.resolve_event_venue_id_for_update(uuid, uuid, jsonb) is
  'Resuelve el venue de un update: payload.venue_id, events.venue_id o nombre exacto. Nunca INSERT.';

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

comment on function public.update_complete_event_tx(uuid, jsonb) is
  'Actualiza evento y tiers atómicamente. Reutiliza venue existente; no inserta recintos en autoguardado.';
