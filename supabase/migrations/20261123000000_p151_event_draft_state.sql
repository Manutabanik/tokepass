-- P151: JSON Draft Pattern for Event Creator V2.
-- Wizard progress lives in events.draft_state. Relational tables
-- (ticket_tiers, venues, seating) stay untouched until final publish.

alter table public.events
  add column if not exists draft_state jsonb;

comment on column public.events.draft_state is
  'Event Creator V2 raw JSON draft. Not the public catalog source of truth.';
