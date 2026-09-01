-- =============================================================================
-- P198: solicitud de cancelación (eventos publicados)
-- Soft delete de borradores ya vive en is_deleted + deleted_at (p166).
-- No se agrega status = 'deleted': el panel oculta con is_deleted = false.
-- =============================================================================

alter type public.event_status add value if not exists 'cancellation_requested';

alter table public.events
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_request_reason text;

comment on column public.events.cancellation_requested_at is
  'Cuando el organizador pidió cancelar. Super Admin procesa reembolsos aparte.';
comment on column public.events.cancellation_request_reason is
  'Motivo del organizador. No ejecuta reembolsos ni anula QRs.';
