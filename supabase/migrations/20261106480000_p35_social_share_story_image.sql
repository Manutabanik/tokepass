-- P35: Custom Instagram Stories flyer for post-purchase social share.

alter table public.events
  add column if not exists social_share_image_url text;

comment on column public.events.social_share_image_url is
  'Flyer vertical 9:16 (1080x1920) para compartir post-compra en Stories. NULL = fallback OG automático.';
