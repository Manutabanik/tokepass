-- P207 · Public availability must not drop drawable inventory.
-- Units with capacity_per_unit > 0 stay visible even if the linked tier is
-- missing or not marked public (preview / fallback SKU). Reserved/sold status
-- still comes from seating_unit_live_status.

create or replace function public.get_event_seating_units_by_sector(
  p_event_id uuid,
  p_sector_id text,
  p_event_date_id uuid default null
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
declare
  v_day_count integer := 0;
begin
  if p_sector_id is null or btrim(p_sector_id) = '' then
    return;
  end if;

  if not public.seating_catalog_is_readable(p_event_id) then
    return;
  end if;

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  if coalesce(v_day_count, 0) >= 2 and p_event_date_id is null then
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
  left join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and coalesce(u.capacity_per_unit, 1) > 0
    and (
      tt.id is null
      or tt.visibility = 'public'
      or exists (
        select 1
        from public.events as e
        where e.id = p_event_id
          and e.status in (
            'draft'::public.event_status,
            'paused'::public.event_status
          )
      )
    )
    and public.seating_unit_matches_requested_day(
      u.event_date_id,
      p_event_date_id,
      v_day_count
    )
  order by
    u.row_number nulls last,
    u.row_label nulls last,
    u.label;
end;
$$;

create or replace function public.get_event_seating_availability(
  p_event_id uuid,
  p_event_date_id uuid default null
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
declare
  v_allowed boolean := false;
  v_day_count integer := 0;
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

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  if coalesce(v_day_count, 0) >= 2 and p_event_date_id is null then
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
  left join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and coalesce(u.capacity_per_unit, 1) > 0
    and (
      tt.id is null
      or tt.visibility = 'public'
      or exists (
        select 1
        from public.events as e
        where e.id = p_event_id
          and e.status in (
            'draft'::public.event_status,
            'paused'::public.event_status
          )
      )
    )
    and public.seating_unit_matches_requested_day(
      u.event_date_id,
      p_event_date_id,
      v_day_count
    )
  order by
    u.sector_name,
    u.row_number nulls last,
    u.row_label nulls last,
    u.label;
end;
$$;

revoke all on function public.get_event_seating_units_by_sector(uuid, text, uuid)
  from public;
revoke all on function public.get_event_seating_availability(uuid, uuid)
  from public;
grant execute on function public.get_event_seating_units_by_sector(uuid, text, uuid)
  to anon, authenticated, service_role;
grant execute on function public.get_event_seating_availability(uuid, uuid)
  to anon, authenticated, service_role;
