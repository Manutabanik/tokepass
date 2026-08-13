-- =============================================================================
-- P32 · Experiencia Multimedia (video promo + galería ligera)
-- Videos: solo URL YouTube/Vimeo (cero bytes en Storage).
-- Galería: hasta 4 imágenes ligeras (paths/URLs en text[]).
-- =============================================================================

alter table public.events
  add column if not exists promo_video_url text;

alter table public.events
  add column if not exists gallery_urls text[] default '{}'::text[];

comment on column public.events.promo_video_url is
  'URL pública de YouTube o Vimeo para el spot del evento (sin hosting de video).';

comment on column public.events.gallery_urls is
  'Hasta 4 URLs de imágenes de galería (Storage event-flyers u otras públicas).';

-- Endurecer tope de 4 en escritura vía check (nullable / vacío OK)
alter table public.events
  drop constraint if exists events_gallery_urls_max_4;

alter table public.events
  add constraint events_gallery_urls_max_4
  check (
    gallery_urls is null
    or cardinality(gallery_urls) <= 4
  );
