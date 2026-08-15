-- P73 · Artistas globales y lineup relacional (Event M:N Artist).
-- Equivale a los modelos Prisma Artist + EventArtist.
-- La columna jsonb events.lineup (P72) queda como fallback de lectura.

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  spotify_id text,
  genres text[] not null default '{}'::text[],
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artists_name_len check (char_length(btrim(name)) >= 1),
  constraint artists_spotify_id_unique unique (spotify_id)
);

create index if not exists artists_name_lower_idx
  on public.artists (lower(name));

create index if not exists artists_genres_gin_idx
  on public.artists using gin (genres);

drop trigger if exists artists_set_updated_at on public.artists;
create trigger artists_set_updated_at
before update on public.artists
for each row execute function public.set_updated_at();

create table if not exists public.event_artists (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  performance_time timestamptz,
  stage text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_artists_event_artist_unique unique (event_id, artist_id)
);

create index if not exists event_artists_event_order_idx
  on public.event_artists (event_id, sort_order, performance_time);

create index if not exists event_artists_artist_idx
  on public.event_artists (artist_id);

drop trigger if exists event_artists_set_updated_at on public.event_artists;
create trigger event_artists_set_updated_at
before update on public.event_artists
for each row execute function public.set_updated_at();

alter table public.artists enable row level security;
alter table public.event_artists enable row level security;

drop policy if exists artists_select_public on public.artists;
create policy artists_select_public
  on public.artists
  for select
  to anon, authenticated
  using (true);

drop policy if exists artists_insert_organizer on public.artists;
create policy artists_insert_organizer
  on public.artists
  for insert
  to authenticated
  with check (
    public.is_super_admin()
    or exists (
      select 1
      from public.events as e
      where e.organizer_id = auth.uid()
    )
  );

drop policy if exists artists_update_organizer on public.artists;
create policy artists_update_organizer
  on public.artists
  for update
  to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1
      from public.events as e
      where e.organizer_id = auth.uid()
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1
      from public.events as e
      where e.organizer_id = auth.uid()
    )
  );

drop policy if exists artists_delete_superadmin on public.artists;
create policy artists_delete_superadmin
  on public.artists
  for delete
  to authenticated
  using (public.is_super_admin());

drop policy if exists event_artists_select_public on public.event_artists;
create policy event_artists_select_public
  on public.event_artists
  for select
  to anon, authenticated
  using (true);

drop policy if exists event_artists_insert_owner on public.event_artists;
create policy event_artists_insert_owner
  on public.event_artists
  for insert
  to authenticated
  with check (
    public.is_super_admin()
    or public.owns_event(event_id)
  );

drop policy if exists event_artists_update_owner on public.event_artists;
create policy event_artists_update_owner
  on public.event_artists
  for update
  to authenticated
  using (
    public.is_super_admin()
    or public.owns_event(event_id)
  )
  with check (
    public.is_super_admin()
    or public.owns_event(event_id)
  );

drop policy if exists event_artists_delete_owner on public.event_artists;
create policy event_artists_delete_owner
  on public.event_artists
  for delete
  to authenticated
  using (
    public.is_super_admin()
    or public.owns_event(event_id)
  );

grant select on public.artists to anon, authenticated;
grant insert, update on public.artists to authenticated;
grant delete on public.artists to authenticated;

grant select on public.event_artists to anon, authenticated;
grant insert, update, delete on public.event_artists to authenticated;

comment on table public.artists is
  'Catálogo global de artistas/bandas/DJs. Independiente del evento.';
comment on column public.artists.spotify_id is
  'ID de Spotify para sync. Unique cuando está presente.';
comment on table public.event_artists is
  'Lineup M:N enriquecido: set time, escenario y orden por evento.';
comment on column public.event_artists.sort_order is
  'Orden de grilla (drag and drop). Equivale a EventArtist.order en Prisma.';
