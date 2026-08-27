-- P177 · Publish inventory is maps, then units. One writer.
--
-- publish_event_v2_core still calls materialize_event_seating_units before
-- seating_maps exist. The wrapper rematerialized after maps, and TypeScript
-- rematerialized again. Three passes, first one from venues.seating_layout.
--
-- Core stays the ticket/schedule writer. During that phase materialize is a
-- no-op. publish_event_seating_inventory is the only publish inventory step.

create or replace function public.publish_event_seating_inventory(
  p_event_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_has_plan boolean := false;
begin
  perform public.sync_published_seating_maps(
    p_event_id,
    case
      when p_payload ? 'seating_maps'
           and jsonb_typeof(p_payload -> 'seating_maps') = 'array'
        then p_payload -> 'seating_maps'
      else '[]'::jsonb
    end
  );

  begin
    v_has_plan := coalesce((p_payload ->> 'has_seating_plan')::boolean, false);
  exception
    when others then
      v_has_plan := false;
  end;

  if v_has_plan then
    perform public.materialize_event_seating_units(p_event_id);
  else
    perform public.purge_orphan_undated_seating_units(p_event_id);
  end if;
end;
$$;

revoke all on function public.publish_event_seating_inventory(uuid, jsonb)
  from public, anon;
grant execute on function public.publish_event_seating_inventory(uuid, jsonb)
  to authenticated, service_role;

comment on function public.publish_event_seating_inventory(uuid, jsonb) is
  'Writes seating_maps then materializes units. The only publish inventory step.';

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
      for v_tier in
        select *
        from public.ticket_tiers as tt
        where tt.event_id = p_event_id
          and tt.layout_type <> 'general'
          and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null
          and (
            v_day_count < 2
            or tt.day_id is not distinct from v_map.event_date_id
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
    return v_count;
  end if;

  update public.ticket_tiers as tt
  set seating_sector_id = tt.seating_sector_id
  where tt.event_id = p_event_id
    and tt.layout_type <> 'general'
    and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null;

  get diagnostics v_count = row_count;
  perform public.purge_orphan_undated_seating_units(p_event_id);
  return v_count;
end;
$$;

comment on function public.materialize_event_seating_units(uuid) is
  'Builds units from seating_maps. No-op while publish_event_v2_core runs.';

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
  v_result := public.publish_event_v2_core(p_event_id, p_payload);
  perform set_config('tokepass.publish_phase', 'inventory', true);
  perform public.publish_event_seating_inventory(p_event_id, p_payload);
  perform set_config('tokepass.publish_phase', '', true);
  return v_result;
end;
$$;

comment on function public.publish_event_v2(uuid, jsonb) is
  'Tickets/schedule via core, then maps and units via publish_event_seating_inventory.';
