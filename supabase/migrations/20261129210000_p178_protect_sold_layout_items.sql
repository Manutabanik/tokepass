-- P178 · Maps cannot drop sold or held layout items.
--
-- apply_seating_layout_to_tier only deletes available/blocked rows. A republish
-- that removes mesa-09 after a Friday sale left the sold unit orphaned and the
-- map without that node. Deleting a day's seating_maps row skipped apply for
-- that day entirely, so leftover available units stayed on the catalog.
--
-- One reconciler after materialize: protected items must still exist in a
-- covering map; leftover empties that the maps no longer own are deleted.

create or replace function public.seating_unit_is_protected(
  p_status text,
  p_sold_order_id uuid,
  p_reserved_until timestamptz
)
returns boolean
language sql
stable
as $$
  select
    coalesce(p_status, '') in ('sold', 'reserved')
    or p_sold_order_id is not null
    or (p_reserved_until is not null and p_reserved_until > now());
$$;

comment on function public.seating_unit_is_protected(text, uuid, timestamptz) is
  'Sold, reserved, or an unexpired hold. Those layout items cannot leave the map.';

revoke all on function public.seating_unit_is_protected(text, uuid, timestamptz)
  from public, anon;
grant execute on function public.seating_unit_is_protected(text, uuid, timestamptz)
  to authenticated, service_role;

create or replace function public.seating_layout_has_item(
  p_layout jsonb,
  p_item_id text
)
returns boolean
language sql
immutable
as $$
  select
    nullif(btrim(coalesce(p_item_id, '')), '') is not null
    and exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_layout) = 'array' then p_layout
          when jsonb_typeof(p_layout) = 'object' then jsonb_build_array(p_layout)
          else '[]'::jsonb
        end
      ) as sector
      where coalesce(sector ->> 'id', '') = p_item_id
         or coalesce(sector ->> 'sector_id', '') = p_item_id
         or exists (
           select 1
           from jsonb_array_elements(
             case
               when jsonb_typeof(sector -> 'rows') = 'array' then sector -> 'rows'
               else '[]'::jsonb
             end
           ) as row
           cross join lateral jsonb_array_elements(
             case
               when jsonb_typeof(row -> 'items') = 'array' then row -> 'items'
               else '[]'::jsonb
             end
           ) as item
           where coalesce(item ->> 'id', '') = p_item_id
         )
         or exists (
           select 1
           from jsonb_array_elements(
             case
               when jsonb_typeof(sector -> 'items') = 'array' then sector -> 'items'
               else '[]'::jsonb
             end
           ) as item
           where coalesce(item ->> 'id', '') = p_item_id
         )
    );
$$;

comment on function public.seating_layout_has_item(jsonb, text) is
  'True when the seating_layout JSON still contains that sector or item id.';

revoke all on function public.seating_layout_has_item(jsonb, text)
  from public, anon;
grant execute on function public.seating_layout_has_item(jsonb, text)
  to authenticated, service_role;

create or replace function public.seating_maps_cover_layout_item(
  p_event_id uuid,
  p_item_id text,
  p_unit_date uuid,
  p_day_count integer
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.seating_maps as sm
    where sm.event_id = p_event_id
      and jsonb_typeof(sm.seating_layout) = 'array'
      and jsonb_array_length(sm.seating_layout) > 0
      and public.seating_unit_matches_requested_day(
        p_unit_date,
        sm.event_date_id,
        p_day_count
      )
      and public.seating_layout_has_item(sm.seating_layout, p_item_id)
  );
$$;

comment on function public.seating_maps_cover_layout_item(uuid, text, uuid, integer) is
  'A published map for that jornada still contains the layout item.';

revoke all on function public.seating_maps_cover_layout_item(uuid, text, uuid, integer)
  from public, anon;
grant execute on function public.seating_maps_cover_layout_item(uuid, text, uuid, integer)
  to authenticated, service_role;

create or replace function public.assert_and_reconcile_seating_units_to_maps(
  p_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day_count integer := 0;
  v_has_maps boolean := false;
  v_deleted integer := 0;
begin
  if p_event_id is null then
    return 0;
  end if;

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

  if exists (
    select 1
    from public.event_seating_units as u
    where u.event_id = p_event_id
      and public.seating_unit_is_protected(
        u.status,
        u.sold_order_id,
        u.reserved_until
      )
      and (
        not v_has_maps
        or not public.seating_maps_cover_layout_item(
          p_event_id,
          u.layout_item_id,
          u.event_date_id,
          v_day_count
        )
      )
  ) then
    raise exception 'SEATING_LAYOUT_SOLD_ITEM_REMOVED' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.seat_holds as h
    where h.event_id = p_event_id
      and h.expires_at > now()
      and nullif(btrim(coalesce(h.layout_item_id, '')), '') is not null
      and (
        not v_has_maps
        or not public.seating_maps_cover_layout_item(
          p_event_id,
          h.layout_item_id,
          h.event_date_id,
          v_day_count
        )
      )
  ) then
    raise exception 'SEATING_LAYOUT_SOLD_ITEM_REMOVED' using errcode = '23514';
  end if;

  if not v_has_maps then
    delete from public.event_seating_units
    where event_id = p_event_id
      and status in ('available', 'blocked');
    get diagnostics v_deleted = row_count;
    return v_deleted;
  end if;

  delete from public.event_seating_units as u
  where u.event_id = p_event_id
    and u.status in ('available', 'blocked')
    and not public.seating_maps_cover_layout_item(
      p_event_id,
      u.layout_item_id,
      u.event_date_id,
      v_day_count
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.assert_and_reconcile_seating_units_to_maps(uuid)
  from public, anon;
grant execute on function public.assert_and_reconcile_seating_units_to_maps(uuid)
  to authenticated, service_role;

comment on function public.assert_and_reconcile_seating_units_to_maps(uuid) is
  'Fails closed if sold/held items left the map. Deletes leftover available/blocked units.';

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
    perform public.assert_and_reconcile_seating_units_to_maps(p_event_id);
    return v_count;
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
  'Builds units from seating_maps, then refuses maps that drop sold or held items.';

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
    perform public.assert_and_reconcile_seating_units_to_maps(p_event_id);
  end if;
end;
$$;

comment on function public.publish_event_seating_inventory(uuid, jsonb) is
  'Writes seating_maps, materializes units, and refuses dropping sold or held items.';
