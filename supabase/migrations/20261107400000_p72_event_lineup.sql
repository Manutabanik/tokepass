-- P72 · Lineup y cronograma del evento (JSON flexible).
alter table public.events
  add column if not exists lineup jsonb default '[]'::jsonb;

comment on column public.events.lineup is
  'Artistas y set times del evento. Acepta array o { artists, schedule }.';
