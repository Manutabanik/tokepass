-- P74 · Headliners en event_artists.
-- Equivale a EventArtist.isHeadliner Boolean @default(false).

alter table public.event_artists
  add column if not exists is_headliner boolean not null default false;

comment on column public.event_artists.is_headliner is
  'Artista principal (headliner) destacado en la grilla pública.';

create index if not exists event_artists_event_headliner_idx
  on public.event_artists (event_id)
  where is_headliner;
