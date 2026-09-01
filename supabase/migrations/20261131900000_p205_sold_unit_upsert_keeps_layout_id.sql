-- P205 · Sold/reserved units stay on the same layout_item_id.
-- Recategorizing (new tier_id / sector_id) must not INSERT a second available
-- row or leave the sold unit orphaned.

create or replace function public.upsert_event_seating_unit_row(
  p_event_id uuid,
  p_venue_id uuid,
  p_tier_id uuid,
  p_event_date_id uuid,
  p_sector_id text,
  p_sector_name text,
  p_layout_item_id text,
  p_label text,
  p_row_id text,
  p_row_number integer,
  p_row_label text,
  p_color text,
  p_layout_type text,
  p_capacity integer,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_tier_id uuid;
  v_status text;
begin
  select u.id, u.tier_id, u.status
    into v_id, v_tier_id, v_status
  from public.event_seating_units as u
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and u.layout_item_id = p_layout_item_id
    and u.event_date_id is not distinct from p_event_date_id
  limit 1
  for update;

  if v_id is null then
    select u.id, u.tier_id, u.status
      into v_id, v_tier_id, v_status
    from public.event_seating_units as u
    where u.event_id = p_event_id
      and u.layout_item_id = p_layout_item_id
      and u.event_date_id is not distinct from p_event_date_id
    order by case when u.status in ('sold', 'reserved') then 0 else 1 end
    limit 1
    for update;
  end if;

  if v_id is not null then
    if v_status in ('sold', 'reserved') then
      return;
    end if;

    update public.event_seating_units
    set
      venue_id = p_venue_id,
      tier_id = p_tier_id,
      sector_id = p_sector_id,
      sector_name = p_sector_name,
      label = p_label,
      row_id = p_row_id,
      row_number = p_row_number,
      row_label = p_row_label,
      color = p_color,
      layout_type = p_layout_type,
      capacity_per_unit = p_capacity,
      status = p_status,
      updated_at = now()
    where id = v_id;
    return;
  end if;

  if exists (
    select 1
    from public.event_seating_units as u
    where u.event_id = p_event_id
      and u.layout_item_id = p_layout_item_id
      and u.event_date_id is not distinct from p_event_date_id
      and u.status in ('sold', 'reserved')
  ) then
    return;
  end if;

  update public.event_seating_units
  set
    venue_id = p_venue_id,
    sector_id = p_sector_id,
    sector_name = p_sector_name,
    label = p_label,
    row_id = p_row_id,
    row_number = p_row_number,
    row_label = p_row_label,
    color = p_color,
    layout_type = p_layout_type,
    capacity_per_unit = p_capacity,
    status = case
      when status in ('sold', 'reserved') then status
      else p_status
    end,
    updated_at = now()
  where event_id = p_event_id
    and tier_id = p_tier_id
    and layout_item_id = p_layout_item_id
    and event_date_id is not distinct from p_event_date_id;

  if found then
    return;
  end if;

  if p_event_date_id is null then
    insert into public.event_seating_units (
      event_id, venue_id, tier_id, event_date_id, sector_id, sector_name,
      layout_item_id, label, row_id, row_number, row_label,
      color, layout_type, capacity_per_unit, status
    )
    values (
      p_event_id, p_venue_id, p_tier_id, p_event_date_id, p_sector_id, p_sector_name,
      p_layout_item_id, p_label, p_row_id, p_row_number, p_row_label,
      p_color, p_layout_type, p_capacity, p_status
    )
    on conflict (event_id, sector_id, layout_item_id) where event_date_id is null
    do update
      set
        venue_id = excluded.venue_id,
        tier_id = case
          when event_seating_units.status in ('sold', 'reserved')
            then event_seating_units.tier_id
          else excluded.tier_id
        end,
        sector_name = excluded.sector_name,
        label = excluded.label,
        row_id = excluded.row_id,
        row_number = excluded.row_number,
        row_label = excluded.row_label,
        color = excluded.color,
        layout_type = excluded.layout_type,
        capacity_per_unit = excluded.capacity_per_unit,
        status = case
          when event_seating_units.status in ('sold', 'reserved')
            then event_seating_units.status
          else excluded.status
        end,
        updated_at = now();
    return;
  end if;

  insert into public.event_seating_units (
    event_id, venue_id, tier_id, event_date_id, sector_id, sector_name,
    layout_item_id, label, row_id, row_number, row_label,
    color, layout_type, capacity_per_unit, status
  )
  values (
    p_event_id, p_venue_id, p_tier_id, p_event_date_id, p_sector_id, p_sector_name,
    p_layout_item_id, p_label, p_row_id, p_row_number, p_row_label,
    p_color, p_layout_type, p_capacity, p_status
  )
  on conflict (event_id, sector_id, layout_item_id, event_date_id)
    where event_date_id is not null
  do update
    set
      venue_id = excluded.venue_id,
      tier_id = case
        when event_seating_units.status in ('sold', 'reserved')
          then event_seating_units.tier_id
        else excluded.tier_id
      end,
      sector_name = excluded.sector_name,
      label = excluded.label,
      row_id = excluded.row_id,
      row_number = excluded.row_number,
      row_label = excluded.row_label,
      color = excluded.color,
      layout_type = excluded.layout_type,
      capacity_per_unit = excluded.capacity_per_unit,
      status = case
        when event_seating_units.status in ('sold', 'reserved')
          then event_seating_units.status
        else excluded.status
      end,
      updated_at = now();
end;
$$;

comment on function public.upsert_event_seating_unit_row(
  uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text, text, integer, text
) is
  'Writes one unit per physical seat. Recategorizing never inserts a second row for a sold/reserved layout_item_id.';
