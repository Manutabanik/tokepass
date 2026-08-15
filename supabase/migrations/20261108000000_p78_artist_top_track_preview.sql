-- P78 Artist top-track audio preview for B2C on-avatar playback.

alter table public.artists
  add column if not exists top_track_preview_url text,
  add column if not exists top_track_name text;

comment on column public.artists.top_track_preview_url is
  'Fragmento oficial (~30s) de la cancion mas escuchada. Equivale a Artist.topTrackPreviewUrl.';
comment on column public.artists.top_track_name is
  'Nombre del tema asociado al preview. Equivale a Artist.topTrackName.';
