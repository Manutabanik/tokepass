-- P180 · Multi-day matching uses maps and tickets, not only event_schedules.
--
-- If schedule_days failed to expand event_schedules to 2 rows, p179 treated
-- the event as single-day and applied every seated tier to the same map
-- (SEATING_SECTOR_TIER_COLLISION / physical_undated 23505). Count dated
-- seating_maps as jornadas too.

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
  v_schedule_count integer := 0;
  v_map_days integer := 0;
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
    into v_schedule_count
  from public.event_schedules
  where event_id = p_event_id;

  select count(distinct sm.event_date_id)::integer
    into v_map_days
  from public.seating_maps as sm
  where sm.event_id = p_event_id
    and sm.event_date_id is not null
    and jsonb_typeof(sm.seating_layout) = 'array'
    and jsonb_array_length(sm.seating_layout) > 0;

  v_day_count := greatest(
    coalesce(v_schedule_count, 0),
    coalesce(v_map_days, 0)
  );

  if v_day_count = 1 then
    select s.id
      into v_only_day
    from public.event_schedules as s
    where s.event_id = p_event_id
    limit 1;
    if v_only_day is null then
      select sm.event_date_id
        into v_only_day
      from public.seating_maps as sm
      where sm.event_id = p_event_id
        and sm.event_date_id is not null
      limit 1;
    end if;
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
  'Builds units from seating_maps. Day count is max(schedules, dated maps).';
