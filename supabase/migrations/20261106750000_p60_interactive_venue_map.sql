-- =============================================================================
-- Tokepass · Planos visuales de recinto (venue_map)
-- 2026-08-14
-- =============================================================================

alter table public.venues
  add column if not exists venue_map jsonb not null default jsonb_build_object(
    'version', 1,
    'stage', null,
    'labels', '[]'::jsonb,
    'aisles', '[]'::jsonb,
    'sectors', '[]'::jsonb
  );

alter table public.events
  add column if not exists venue_map jsonb not null default jsonb_build_object(
    'version', 1,
    'stage', null,
    'labels', '[]'::jsonb,
    'aisles', '[]'::jsonb,
    'sectors', '[]'::jsonb
  );

comment on column public.venues.venue_map is
  'Plano visual SVG (escenario, sectores, etiquetas) para el editor de mapas.';
comment on column public.events.venue_map is
  'Copia del plano visual del recinto, sincronizada desde venues.venue_map.';

create or replace function public.sync_event_venue_map_from_venue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map jsonb;
begin
  if new.venue_id is null then
    return new;
  end if;
  select v.venue_map into v_map
  from public.venues v
  where v.id = new.venue_id;
  if v_map is not null then
    new.venue_map := v_map;
  end if;
  return new;
end;
$$;

drop trigger if exists events_sync_venue_map on public.events;
create trigger events_sync_venue_map
  before insert or update of venue_id
  on public.events
  for each row
  execute function public.sync_event_venue_map_from_venue();

create or replace function public.push_venue_map_to_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.events
  set venue_map = new.venue_map,
      updated_at = now()
  where venue_id = new.id;
  return new;
end;
$$;

drop trigger if exists venues_push_venue_map on public.venues;
create trigger venues_push_venue_map
  after insert or update of venue_map
  on public.venues
  for each row
  execute function public.push_venue_map_to_events();
