-- P186 · Estrategia "Absorber cargos" como columna real del evento.
-- Hasta ahora el switch solo vivía en events.draft_state.settings.absorbFees
-- y el checkout público no lo veía. Default false = el comprador paga el cargo.

alter table public.events
  add column if not exists absorb_fees boolean not null default false;

comment on column public.events.absorb_fees is
  'true = el organizador absorbe el cargo TokePass. false (default) = el comprador lo paga.';

update public.events
set absorb_fees = case
  when lower(coalesce(draft_state->'settings'->>'absorbFees', 'false'))
    in ('true', 't', '1')
  then true
  else false
end
where draft_state is not null;
