-- Preventas programadas: ventana de venta por lote (GA no requiere mapa).
alter table public.ticket_tiers
  alter column seating_sector_id drop not null;

alter table public.ticket_tiers
  add column if not exists sale_starts_at timestamptz;

alter table public.ticket_tiers
  add column if not exists sale_ends_at timestamptz;

comment on column public.ticket_tiers.seating_sector_id is
  'Opcional. NULL = lote de admisión general sin plano de asientos.';

comment on column public.ticket_tiers.sale_starts_at is
  'Inicio de venta del lote. NULL = inmediato.';

comment on column public.ticket_tiers.sale_ends_at is
  'Fin de venta del lote. NULL = hasta la fecha del evento.';

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_sale_window_check;

alter table public.ticket_tiers
  add constraint ticket_tiers_sale_window_check
  check (
    sale_starts_at is null
    or sale_ends_at is null
    or sale_ends_at > sale_starts_at
  );
