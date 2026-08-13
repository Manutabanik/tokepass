-- P30: Marketing pixels per event (Meta, TikTok, GA4)

alter table public.events
  add column if not exists meta_pixel_id text,
  add column if not exists meta_pixel_enabled boolean not null default false,
  add column if not exists tiktok_pixel_id text,
  add column if not exists tiktok_pixel_enabled boolean not null default false,
  add column if not exists ga4_measurement_id text,
  add column if not exists ga4_enabled boolean not null default false;

comment on column public.events.meta_pixel_id is
  'Meta (Facebook) Pixel ID del organizador para este evento.';
comment on column public.events.meta_pixel_enabled is
  'Si true, se inyecta el Meta Pixel en el storefront/checkout.';
comment on column public.events.tiktok_pixel_id is
  'TikTok Pixel ID del organizador para este evento.';
comment on column public.events.tiktok_pixel_enabled is
  'Si true, se inyecta el TikTok Pixel en el storefront/checkout.';
comment on column public.events.ga4_measurement_id is
  'Google Analytics 4 Measurement ID (G-XXXXXXXX).';
comment on column public.events.ga4_enabled is
  'Si true, se inyecta GA4 gtag en el storefront/checkout.';
