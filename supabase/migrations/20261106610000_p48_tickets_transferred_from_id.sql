-- =============================================================================
-- P48: Asegurar tickets.transferred_from_id (cadena de transferencias)
-- ---------------------------------------------------------------------------
-- Remoto puede no haber aplicado P19 completo; la vista /admin/events/[id]/tickets
-- selecciona esta columna. Idempotente.
-- =============================================================================

alter table public.tickets
  add column if not exists transferred_from_id uuid
  references public.tickets (id) on delete set null;

comment on column public.tickets.transferred_from_id is
  'Ticket origen cuando esta fila nace de una transferencia / regalo.';

create index if not exists tickets_transferred_from_id_idx
  on public.tickets (transferred_from_id)
  where transferred_from_id is not null;
