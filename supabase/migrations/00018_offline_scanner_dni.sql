-- =============================================================================
-- Tokepass · Zero-Offline Scanner: DNI opcional para búsqueda de emergencia
-- =============================================================================

alter table public.profiles
  add column if not exists dni text;

create index if not exists profiles_dni_idx
  on public.profiles (dni)
  where dni is not null;

comment on column public.profiles.dni is
  'Documento opcional para buscador de emergencia en escáner offline';
