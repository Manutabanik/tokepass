-- P97: el paso de mapa/sectores es opcional. Eventos simples no lo usan.

alter table public.events
  add column if not exists has_seating_plan boolean not null default false;

comment on column public.events.has_seating_plan is
  'Si es true, el wizard muestra Mapa y Sectores. Default false para eventos simples.';

update public.events
set has_seating_plan = true
where has_seating_plan = false
  and (
    venue_id is not null
    or venue_map is not null
  );
