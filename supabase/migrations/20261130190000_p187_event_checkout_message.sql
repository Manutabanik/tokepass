-- P187 · Mensaje post-pago separado de la ficha pública.
alter table public.events
  add column if not exists checkout_message text;

comment on column public.events.checkout_message is
  'Texto que ve el comprador en la pantalla de éxito. No es events.description.';
