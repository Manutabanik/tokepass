-- P70: el update atómico no debe INSERT de venues en cada autoguardado.
-- Si el evento ya tiene venue_id, se reutiliza aunque el payload no lo mande.

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
  v_capacity integer;
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
    p_organizer_id,
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

  return v_venue_id;
end;
$$;

revoke all on function public.resolve_event_venue_id_for_update(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.resolve_event_venue_id_for_update(uuid, uuid, jsonb)
  to authenticated, service_role;

comment on function public.resolve_event_venue_id_for_update(uuid, uuid, jsonb) is
  'Resuelve el venue de un update: payload.venue_id, si no events.venue_id, y solo entonces INSERT.';
