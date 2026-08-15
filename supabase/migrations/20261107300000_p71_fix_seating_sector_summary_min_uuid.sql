-- P71: get_event_seating_sector_summary usaba min(uuid) y Postgres no lo soporta
-- (42883: function min(uuid) does not exist). Se elige un tier_id por sector
-- casteando a text, que es determinístico y válido para uuid.

create or replace function public.get_event_seating_sector_summary(p_event_id uuid)
returns table (
  sector_id text,
  sector_name text,
  color text,
  layout_type text,
  capacity_per_unit integer,
  tier_id uuid,
  available integer,
  reserved integer,
  sold integer,
  blocked integer,
  total integer
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if not public.seating_catalog_is_readable(p_event_id) then
    return;
  end if;

  return query
  select
    u.sector_id,
    min(u.sector_name) as sector_name,
    min(u.color) as color,
    min(u.layout_type) as layout_type,
    min(u.capacity_per_unit)::integer as capacity_per_unit,
    (min(u.tier_id::text))::uuid as tier_id,
    count(*) filter (where u.status = 'available')::integer as available,
    count(*) filter (where u.status = 'reserved')::integer as reserved,
    count(*) filter (where u.status = 'sold')::integer as sold,
    count(*) filter (where u.status = 'blocked')::integer as blocked,
    count(*)::integer as total
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and tt.visibility = 'public'
  group by u.sector_id
  order by min(u.sector_name);
end;
$$;

revoke all on function public.get_event_seating_sector_summary(uuid) from public;
grant execute on function public.get_event_seating_sector_summary(uuid)
  to anon, authenticated, service_role;

comment on function public.get_event_seating_sector_summary(uuid) is
  'Metadatos de disponibilidad por sector para el mapa B2C (sin filas de asiento).';
