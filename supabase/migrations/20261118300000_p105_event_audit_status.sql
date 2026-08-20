-- =============================================================================
-- P105: auditoría de evento antes de venta pública
-- El organizador carga y envía; Tokepass aprueba o pide cambios.
-- Sin CUIT ni plazos fijos.
-- =============================================================================

alter type public.event_status add value if not exists 'pending_approval';
alter type public.event_status add value if not exists 'needs_revision';

alter table public.events
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

comment on column public.events.review_note is
  'Nota de auditoría (pedido de cambios o rechazo). Visible al organizador.';
comment on column public.events.reviewed_at is
  'Última decisión de auditoría.';
comment on column public.events.reviewed_by is
  'Superadmin que aprobó o pidió cambios.';

-- No usar status::text en el predicado: el cast enum->text no es IMMUTABLE (42P17).
create index if not exists events_pending_approval_idx
  on public.events (status, created_at desc);

create or replace function public.event_preview_key_matches(
  p_event_id uuid,
  p_key uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and e.preview_key = p_key
      and e.status::text in ('draft', 'pending_approval', 'needs_revision')
  );
$$;
