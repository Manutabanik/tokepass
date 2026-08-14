-- Persistencia atómica de provincia, departamento y plano del recinto.

alter table public.events
  add column if not exists province text,
  add column if not exists department text;

comment on column public.events.province is
  'Provincia argentina elegida en el alta del evento.';
comment on column public.events.department is
  'Departamento o partido elegido en el alta del evento.';
