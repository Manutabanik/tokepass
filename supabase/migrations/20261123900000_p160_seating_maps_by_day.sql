-- P160: instancias de mapa por jornada (draft seatingMaps[].dateId).
-- No existe event_dates. event_date_id referencia event_schedules.id.

create table if not exists public.seating_maps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  event_date_id uuid references public.event_schedules (id) on delete cascade,
  map_config jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists seating_maps_event_day_uidx
  on public.seating_maps (event_id, event_date_id)
  where event_date_id is not null;

create unique index if not exists seating_maps_event_global_uidx
  on public.seating_maps (event_id)
  where event_date_id is null;

create index if not exists seating_maps_event_idx
  on public.seating_maps (event_id);

comment on table public.seating_maps is
  'Instancias de mapa V2 por jornada. event_date_id = event_schedules.id (dateId del draft).';
comment on column public.seating_maps.event_date_id is
  'Jornada (event_schedules.id). Alias de producto: event_date_id. NULL = evento de un solo día.';

alter table public.seating_maps enable row level security;

drop policy if exists seating_maps_select_visible on public.seating_maps;
create policy seating_maps_select_visible
  on public.seating_maps
  for select
  using (
    exists (
      select 1
      from public.events as e
      where e.id = seating_maps.event_id
        and (
          e.status in ('published', 'paused')
          or e.organizer_id = auth.uid()
        )
    )
  );

drop policy if exists seating_maps_organizer_write on public.seating_maps;
create policy seating_maps_organizer_write
  on public.seating_maps
  for all
  using (
    exists (
      select 1
      from public.events as e
      where e.id = seating_maps.event_id
        and e.organizer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events as e
      where e.id = seating_maps.event_id
        and e.organizer_id = auth.uid()
    )
  );

revoke all on table public.seating_maps from anon;
grant select on table public.seating_maps to anon, authenticated, service_role;
grant insert, update, delete on table public.seating_maps to authenticated, service_role;
