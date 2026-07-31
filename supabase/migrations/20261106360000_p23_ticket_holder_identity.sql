-- =============================================================================
-- P23: Ticket holder identity for door lookup (name / DNI / email)
-- =============================================================================

alter table public.tickets
  add column if not exists holder_name text;

alter table public.tickets
  add column if not exists holder_dni text;

alter table public.tickets
  add column if not exists holder_email text;

comment on column public.tickets.holder_name is
  'Nombre del asistente declarado en checkout (lookup de puerta).';
comment on column public.tickets.holder_dni is
  'DNI del asistente declarado en checkout (lookup de puerta / tótem).';
comment on column public.tickets.holder_email is
  'Email de confirmación declarado en checkout.';

create index if not exists tickets_holder_dni_idx
  on public.tickets (holder_dni)
  where holder_dni is not null;

create index if not exists tickets_event_holder_dni_idx
  on public.tickets (event_id, holder_dni)
  where holder_dni is not null;
