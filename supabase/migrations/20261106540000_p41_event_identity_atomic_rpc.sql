-- P41: Identidad atómica en creación/edición de eventos
-- category_id + age_restriction + ends_at en la misma TX del wrapper seating.

do $$ begin
  create type public.event_age_restriction as enum ('atp', '16', '18');
exception
  when duplicate_object then null;
end $$;

alter table public.events
  add column if not exists age_restriction public.event_age_restriction
    not null default 'atp'::public.event_age_restriction;

alter table public.events
  add column if not exists ends_at timestamptz;

comment on column public.events.age_restriction is
  'Restricción de edad del evento: ATP, +16 o +18.';
comment on column public.events.ends_at is
  'Hora de finalización (jornada única). En multijornada usar schedule_days.';

create or replace function public.create_complete_event_with_seating_tx(
  payload jsonb,
  p_organizer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_category_id uuid;
  v_age public.event_age_restriction;
  v_ends_at timestamptz;
  v_age_raw text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or (
         auth.uid() is distinct from p_organizer_id
         and not public.is_super_admin()
       )
     ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.is_approved_organizer(p_organizer_id) then
    raise exception 'ORGANIZER_NOT_APPROVED' using errcode = '42501';
  end if;

  begin
    v_category_id := nullif(btrim(payload ->> 'category_id'), '')::uuid;
  exception
    when others then
      raise exception 'category_id inválido' using errcode = '22P02';
  end;

  if v_category_id is null then
    raise exception 'La categoría del evento es obligatoria'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.event_categories as c
    where c.id = v_category_id
      and c.is_active
  ) then
    raise exception 'Categoría inexistente o inactiva'
      using errcode = '22023';
  end if;

  v_age_raw := lower(coalesce(nullif(btrim(payload ->> 'age_restriction'), ''), 'atp'));
  if v_age_raw not in ('atp', '16', '18') then
    raise exception 'Restricción de edad inválida'
      using errcode = '22023';
  end if;
  v_age := v_age_raw::public.event_age_restriction;

  v_ends_at := null;
  if nullif(btrim(payload ->> 'ends_at'), '') is not null then
    begin
      v_ends_at := (payload ->> 'ends_at')::timestamptz;
    exception
      when others then
        raise exception 'Hora de finalización inválida'
          using errcode = '22007';
    end;
  end if;

  v_event_id := public.create_complete_event_tx(payload, p_organizer_id);

  update public.events
  set
    category_id = v_category_id,
    age_restriction = v_age,
    ends_at = v_ends_at,
    updated_at = now()
  where id = v_event_id;

  perform public.configure_event_seating_tiers(
    v_event_id,
    coalesce(payload -> 'tiers', '[]'::jsonb)
  );

  return v_event_id;
end;
$$;

revoke all on function public.create_complete_event_with_seating_tx(jsonb, uuid)
  from public, anon;
grant execute on function public.create_complete_event_with_seating_tx(jsonb, uuid)
  to authenticated, service_role;

create or replace function public.update_complete_event_with_seating_tx(
  p_event_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_organizer_id uuid;
  v_category_id uuid;
  v_age public.event_age_restriction;
  v_ends_at timestamptz;
  v_age_raw text;
begin
  select e.organizer_id
    into v_organizer_id
  from public.events as e
  where e.id = p_event_id;

  if v_organizer_id is null then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or (
         auth.uid() is distinct from v_organizer_id
         and not public.is_super_admin()
       )
     ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.is_approved_organizer(v_organizer_id) then
    raise exception 'ORGANIZER_NOT_APPROVED' using errcode = '42501';
  end if;

  begin
    v_category_id := nullif(btrim(payload ->> 'category_id'), '')::uuid;
  exception
    when others then
      raise exception 'category_id inválido' using errcode = '22P02';
  end;

  if v_category_id is null then
    raise exception 'La categoría del evento es obligatoria'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.event_categories as c
    where c.id = v_category_id
      and c.is_active
  ) then
    raise exception 'Categoría inexistente o inactiva'
      using errcode = '22023';
  end if;

  v_age_raw := lower(coalesce(nullif(btrim(payload ->> 'age_restriction'), ''), 'atp'));
  if v_age_raw not in ('atp', '16', '18') then
    raise exception 'Restricción de edad inválida'
      using errcode = '22023';
  end if;
  v_age := v_age_raw::public.event_age_restriction;

  v_ends_at := null;
  if nullif(btrim(payload ->> 'ends_at'), '') is not null then
    begin
      v_ends_at := (payload ->> 'ends_at')::timestamptz;
    exception
      when others then
        raise exception 'Hora de finalización inválida'
          using errcode = '22007';
    end;
  end if;

  v_event_id := public.update_complete_event_tx(p_event_id, payload);

  update public.events
  set
    category_id = v_category_id,
    age_restriction = v_age,
    ends_at = v_ends_at,
    updated_at = now()
  where id = v_event_id;

  perform public.configure_event_seating_tiers(
    v_event_id,
    coalesce(payload -> 'tiers', '[]'::jsonb)
  );

  return v_event_id;
end;
$$;

revoke all on function public.update_complete_event_with_seating_tx(uuid, jsonb)
  from public, anon;
grant execute on function public.update_complete_event_with_seating_tx(uuid, jsonb)
  to authenticated, service_role;
