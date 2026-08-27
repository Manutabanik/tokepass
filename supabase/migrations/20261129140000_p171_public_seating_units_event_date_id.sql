-- =============================================================================
-- P171 · Public seating RPCs expose event_date_id
--
-- Checkout occupancy keys by layout_item_id (mesa-09). Without the jornada,
-- a sold Friday table paints Saturday occupied. RETURNS TABLE changes require
-- DROP + CREATE.
-- =============================================================================

drop function if exists public.get_event_seating_units_by_sector(uuid, text);
drop function if exists public.get_event_seating_availability(uuid);

create function public.get_event_seating_units_by_sector(
  p_event_id uuid,
  p_sector_id text
)
returns table (
  id uuid,
  tier_id uuid,
  sector_id text,
  sector_name text,
  layout_item_id text,
  label text,
  row_id text,
  row_number integer,
  row_label text,
  color text,
  layout_type text,
  capacity_per_unit integer,
  status text,
  reserved_until timestamptz,
  event_date_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if p_sector_id is null or btrim(p_sector_id) = '' then
    return;
  end if;

  if not public.seating_catalog_is_readable(p_event_id) then
    return;
  end if;

  return query
  select
    u.id,
    u.tier_id,
    u.sector_id,
    u.sector_name,
    u.layout_item_id,
    u.label,
    u.row_id,
    u.row_number,
    u.row_label,
    u.color,
    u.layout_type,
    u.capacity_per_unit,
    public.seating_unit_live_status(u.status, u.reserved_until),
    case
      when public.seating_unit_live_status(u.status, u.reserved_until) = 'reserved'
        then u.reserved_until
      else null
    end,
    u.event_date_id
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and tt.visibility = 'public'
  order by
    u.row_number nulls last,
    u.row_label nulls last,
    u.label;
end;
$$;

create function public.get_event_seating_availability(p_event_id uuid)
returns table (
  id uuid,
  tier_id uuid,
  sector_id text,
  sector_name text,
  layout_item_id text,
  label text,
  row_id text,
  row_number integer,
  row_label text,
  color text,
  layout_type text,
  capacity_per_unit integer,
  status text,
  reserved_until timestamptz,
  event_date_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_allowed boolean := false;
begin
  select
    (
      e.status = 'published'::public.event_status
      and e.visibility in ('public', 'private')
    )
    or (
      e.status in (
        'draft'::public.event_status,
        'paused'::public.event_status
      )
      and (
        coalesce(auth.role(), '') = 'service_role'
        or e.organizer_id = auth.uid()
        or public.is_super_admin()
      )
    )
  into v_allowed
  from public.events as e
  where e.id = p_event_id;

  if not coalesce(v_allowed, false) then
    return;
  end if;

  return query
  select
    u.id,
    u.tier_id,
    u.sector_id,
    u.sector_name,
    u.layout_item_id,
    u.label,
    u.row_id,
    u.row_number,
    u.row_label,
    u.color,
    u.layout_type,
    u.capacity_per_unit,
    public.seating_unit_live_status(u.status, u.reserved_until),
    case
      when public.seating_unit_live_status(u.status, u.reserved_until) = 'reserved'
        then u.reserved_until
      else null
    end,
    u.event_date_id
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and tt.visibility = 'public'
  order by
    u.sector_name,
    u.row_number nulls last,
    u.row_label nulls last,
    u.label;
end;
$$;

revoke all on function public.get_event_seating_units_by_sector(uuid, text) from public;
revoke all on function public.get_event_seating_availability(uuid) from public;
grant execute on function public.get_event_seating_units_by_sector(uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.get_event_seating_availability(uuid)
  to anon, authenticated, service_role;

comment on function public.get_event_seating_units_by_sector(uuid, text) is
  'Lazy sector inventory. Includes event_date_id so checkout occupancy is per jornada.';
comment on function public.get_event_seating_availability(uuid) is
  'Full-event seating occupancy. Includes event_date_id so multi-day maps do not collapse.';
