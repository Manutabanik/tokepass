-- P159 · Copy de experiencia en events (restricciones + qué llevar).
-- promo_video_url y gallery_urls ya existen (p32).

alter table public.events
  add column if not exists restrictions text;

alter table public.events
  add column if not exists what_to_bring text;

comment on column public.events.restrictions is
  'Texto libre de restricciones y edad para la ficha pública.';

comment on column public.events.what_to_bring is
  'Texto libre de qué llevar / qué no llevar para la ficha pública.';
