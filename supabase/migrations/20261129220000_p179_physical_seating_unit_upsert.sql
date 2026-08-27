-- P179 · One physical seat is one unit. Upsert by (event, sector, item, day).
--
-- event_seating_units_physical_undated_uidx is (event_id, sector_id, layout_item_id)
-- WHERE event_date_id IS NULL. upsert_event_seating_unit_row looked up by
-- (event_id, tier_id, layout_item_id, event_date_id). A rematch or a second
-- map ticket on the same sector (p170 allows two undated tickets during
-- publish unlink) tried INSERT and raised 23505.
--
-- Single-day materialize also applied every seated tier to the same map
-- (v_day_count < 2), so Friday and Saturday leftovers wrote the same
-- undated physical key.

create or replace function public.seating_tier_matches_map_day(
  p_tier_day uuid,
  p_map_day uuid,
  p_day_count integer,
  p_only_day uuid
)
returns boolean
language sql
immutable
as $$
  select case
    when coalesce(p_day_count, 0) >= 2 then
      p_tier_day is not distinct from p_map_day
    when p_tier_day is null then
      true
    when p_map_day is not null then
      p_tier_day = p_map_day
    else
      p_only_day is not null and p_tier_day = p_only_day
  end;
$$;

revoke all on function public.seating_tier_matches_map_day(uuid, uuid, integer, uuid)
  from public, anon;
grant execute on function public.seating_tier_matches_map_day(uuid, uuid, integer, uuid)
  to authenticated, service_role;

comment on function public.seating_tier_matches_map_day(uuid, uuid, integer, uuid) is
  'Whether a ticket_tiers.day_id belongs to this seating_maps.event_date_id.';

create or replace function public.assert_one_seated_tier_per_map_sector(
  p_event_id uuid,
  p_map_day uuid,
  p_day_count integer,
  p_only_day uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id
      and tt.layout_type <> 'general'
      and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null
      and public.seating_tier_matches_map_day(
        tt.day_id,
        p_map_day,
        p_day_count,
        p_only_day
      )
    group by tt.seating_sector_id
    having count(*) > 1
  ) then
    raise exception 'SEATING_SECTOR_TIER_COLLISION' using errcode = '23505';
  end if;
end;
$$;

revoke all on function public.assert_one_seated_tier_per_map_sector(uuid, uuid, integer, uuid)
  from public, anon;
grant execute on function public.assert_one_seated_tier_per_map_sector(uuid, uuid, integer, uuid)
  to authenticated, service_role;

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

  if v_id is not null then
    if v_tier_id is distinct from p_tier_id
       and v_status in ('sold', 'reserved') then
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
      status = case
        when status in ('sold', 'reserved') then status
        else p_status
      end,
      updated_at = now()
    where id = v_id;
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
  'Writes one unit per physical seat (event, sector, layout item, jornada). Rematches empty units; never steals sold/reserved.';

create or replace function public.sync_event_seating_units_from_tier()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('tokepass.skip_seating_sync', true), '') = 'on' then
    return new;
  end if;

  if current_setting('tokepass.publish_phase', true) = 'core' then
    return new;
  end if;

  if exists (
    select 1
    from public.seating_maps as sm
    where sm.event_id = new.event_id
      and jsonb_typeof(sm.seating_layout) = 'array'
      and jsonb_array_length(sm.seating_layout) > 0
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(current_setting('tokepass.force_seating_sync', true), '') <> 'on'
     and old.layout_type is not distinct from new.layout_type
     and old.seating_sector_id is not distinct from new.seating_sector_id
     and old.capacity_per_unit is not distinct from new.capacity_per_unit
     and old.day_id is not distinct from new.day_id then
    return new;
  end if;

  if coalesce(current_setting('tokepass.force_seating_sync', true), '') <> 'on'
     and exists (
       select 1
       from public.events as e
       where e.id = new.event_id
         and e.status = 'draft'::public.event_status
     ) then
    return new;
  end if;

  perform public.apply_seating_layout_to_tier(
    new,
    public.layout_for_event_seating_tier(new.event_id, new.day_id),
    new.day_id
  );
  return new;
end;
$$;

create or replace function public.materialize_event_seating_units(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_added integer := 0;
  v_tier public.ticket_tiers%rowtype;
  v_map public.seating_maps%rowtype;
  v_day_count integer := 0;
  v_only_day uuid;
  v_has_maps boolean := false;
begin
  if current_setting('tokepass.publish_phase', true) = 'core' then
    return 0;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is not null
     and not public.owns_event(p_event_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform set_config('tokepass.force_seating_sync', 'on', true);

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  if v_day_count = 1 then
    select s.id
      into v_only_day
    from public.event_schedules as s
    where s.event_id = p_event_id
    limit 1;
  end if;

  select exists (
    select 1
    from public.seating_maps as sm
    where sm.event_id = p_event_id
      and jsonb_typeof(sm.seating_layout) = 'array'
      and jsonb_array_length(sm.seating_layout) > 0
  )
    into v_has_maps;

  if v_day_count >= 2 and not v_has_maps then
    perform public.purge_orphan_undated_seating_units(p_event_id);
    perform public.assert_and_reconcile_seating_units_to_maps(p_event_id);
    return 0;
  end if;

  if v_has_maps then
    for v_map in
      select *
      from public.seating_maps as sm
      where sm.event_id = p_event_id
    loop
      if v_day_count >= 2 and v_map.event_date_id is null then
        continue;
      end if;
      perform public.assert_one_seated_tier_per_map_sector(
        p_event_id,
        v_map.event_date_id,
        v_day_count,
        v_only_day
      );
      for v_tier in
        select *
        from public.ticket_tiers as tt
        where tt.event_id = p_event_id
          and tt.layout_type <> 'general'
          and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null
          and public.seating_tier_matches_map_day(
            tt.day_id,
            v_map.event_date_id,
            v_day_count,
            v_only_day
          )
      loop
        v_added := public.apply_seating_layout_to_tier(
          v_tier,
          v_map.seating_layout,
          v_map.event_date_id
        );
        v_count := v_count + v_added;
      end loop;
    end loop;
    perform public.purge_orphan_undated_seating_units(p_event_id);
    perform public.assert_and_reconcile_seating_units_to_maps(p_event_id);
    return v_count;
  end if;

  if exists (
    select 1
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id
      and tt.layout_type <> 'general'
      and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null
    group by tt.seating_sector_id, tt.day_id
    having count(*) > 1
  ) then
    raise exception 'SEATING_SECTOR_TIER_COLLISION' using errcode = '23505';
  end if;

  update public.ticket_tiers as tt
  set seating_sector_id = tt.seating_sector_id
  where tt.event_id = p_event_id
    and tt.layout_type <> 'general'
    and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null;

  get diagnostics v_count = row_count;
  perform public.purge_orphan_undated_seating_units(p_event_id);
  perform public.assert_and_reconcile_seating_units_to_maps(p_event_id);
  return v_count;
end;
$$;

comment on function public.materialize_event_seating_units(uuid) is
  'Builds units from seating_maps. One physical seat per jornada; day-matched tiers only.';

create or replace function public.publish_event_v2(
  p_event_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform set_config('tokepass.publish_phase', 'core', true);
  perform set_config('tokepass.skip_seating_sync', 'on', true);
  v_result := public.publish_event_v2_core(p_event_id, p_payload);
  perform set_config('tokepass.skip_seating_sync', '', true);
  perform set_config('tokepass.publish_phase', 'inventory', true);
  perform public.publish_event_seating_inventory(p_event_id, p_payload);
  perform set_config('tokepass.publish_phase', '', true);
  return v_result;
end;
$$;

comment on function public.publish_event_v2(uuid, jsonb) is
  'Tickets/schedule via core without unit writes, then maps and units.';
