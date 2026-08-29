-- P185 · Comisión por defecto 15% para organizadores nuevos y eventos nuevos.
-- profiles.service_charge_rate ya era 0.15 (fracción). events.platform_fee_percentage
-- nacía en 8.00 y el checkout usa esa columna, así que el 15% del perfil no llegaba
-- al comprador. Esta migración:
--   1) Reafirma DEFAULT 0.15 en el perfil (y rellena nulls).
--   2) Cambia el DEFAULT de events.platform_fee_percentage a 15.00.
--   3) En INSERT, copia la tarifa negociada del organizador al evento.
-- No toca eventos existentes.

alter table public.profiles
  alter column service_charge_rate set default 0.15;

update public.profiles
set service_charge_rate = 0.15
where service_charge_rate is null;

comment on column public.profiles.service_charge_rate is
  'Fracción decimal de cargo por servicio del organizador (0.15 = 15%). Solo Super Admin la modifica.';

alter table public.events
  alter column platform_fee_percentage set default 15.00;

comment on column public.events.platform_fee_percentage is
  'Comisión % Tokepass sobre precio público All-In (ej. 15.00 = 15%). Hereda del organizador al crear el evento.';

create or replace function public.events_inherit_organizer_fee()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rate numeric(5, 4);
begin
  if new.organizer_id is null then
    new.platform_fee_percentage := coalesce(new.platform_fee_percentage, 15.00);
    return new;
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
    from public.profiles as p
   where p.id = new.organizer_id;

  new.platform_fee_percentage := round(coalesce(v_rate, 0.15) * 100, 2);
  return new;
end;
$$;

drop trigger if exists events_inherit_organizer_fee_trg on public.events;
create trigger events_inherit_organizer_fee_trg
  before insert on public.events
  for each row
  execute function public.events_inherit_organizer_fee();

comment on function public.events_inherit_organizer_fee() is
  'Al crear un evento, aplica profiles.service_charge_rate (default 15%). El override por evento queda para Super Admin.';

create or replace function public.get_event_service_charge_rate(p_event_id uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when e.is_sponsored_by_tokepass then 0::numeric
    else least(
      0.95,
      greatest(
        0,
        coalesce(e.platform_fee_percentage, 15.00) / 100.0
      )
    )
  end
  from public.events as e
  where e.id = p_event_id;
$$;
