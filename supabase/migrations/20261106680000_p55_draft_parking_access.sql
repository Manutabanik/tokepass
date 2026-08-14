-- P55: borradores sin categoría obligatoria + pases de estacionamiento
-- ticket_type en tickets; categorías parking / access_pass en la tienda.

alter type public.event_item_category add value if not exists 'parking';
alter type public.event_item_category add value if not exists 'access_pass';

alter table public.tickets
  add column if not exists ticket_type text not null default 'admission';

alter table public.tickets
  drop constraint if exists tickets_ticket_type_check;

alter table public.tickets
  add constraint tickets_ticket_type_check
  check (ticket_type in ('admission', 'parking', 'access_pass'));

create index if not exists tickets_event_ticket_type_idx
  on public.tickets (event_id, ticket_type);

comment on column public.tickets.ticket_type is
  'admission = entrada de puerta; parking / access_pass = pases de barrera o acceso extra con QR propio.';

-- Categoría opcional en drafts (el RPC de publicación sigue validando en app).
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

  if v_category_id is not null
     and not exists (
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

  if v_category_id is not null
     and not exists (
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
