-- =============================================================================
-- P11 - Venue geolocation
-- =============================================================================

alter table public.venues
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

update public.venues
set address = location
where address is null
  and location is not null;

alter table public.venues
  drop constraint if exists venues_latitude_check;
alter table public.venues
  add constraint venues_latitude_check
  check (latitude is null or latitude between -90 and 90);

alter table public.venues
  drop constraint if exists venues_longitude_check;
alter table public.venues
  add constraint venues_longitude_check
  check (longitude is null or longitude between -180 and 180);

comment on column public.venues.address is
  'Dirección geocodificada y visible del recinto.';
comment on column public.venues.latitude is
  'Latitud WGS84 ajustada por el organizador.';
comment on column public.venues.longitude is
  'Longitud WGS84 ajustada por el organizador.';
