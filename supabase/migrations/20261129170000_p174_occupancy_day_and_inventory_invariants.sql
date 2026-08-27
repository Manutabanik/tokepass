-- P174 · Multi-day inventory is exact-day or it does not exist.
--
-- Ghosts: publish_event_v2_core materializes from venues.seating_layout
-- before maps exist, leaving event_date_id IS NULL units. Holds/normalize
-- treated those as "any day". Occupancy replica had no jornada, so Friday
-- sold painted Saturday. Public sector/availability RPCs returned every day.
--
-- This migration makes the cores fail closed:
--   * occupancy replica carries event_date_id
--   * hold + cart normalize require exact unit.event_date_id on 2+ jornadas
--   * undated available/blocked units are purged on multi-day events
--   * force-skip layout apply deletes leftover available/blocked for that day
--   * public unit RPCs take p_event_date_id and return nothing on multi-day
--     when the day is missing

-- ---------------------------------------------------------------------------
-- 1) Dedupe before unique indexes can fail; keep sold/reserved
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    status,
    row_number() over (
      partition by event_id, tier_id, layout_item_id, event_date_id
      order by
        case status
          when 'sold' then 0
          when 'reserved' then 1
          else 2
        end,
        id
    ) as rn
  from public.event_seating_units
  where event_date_id is not null
)
delete from public.event_seating_units as u
using ranked as r
where u.id = r.id
  and r.rn > 1
  and u.status in ('available', 'blocked');

with ranked as (
  select
    id,
    status,
    row_number() over (
      partition by event_id, tier_id, layout_item_id
      order by
        case status
          when 'sold' then 0
          when 'reserved' then 1
          else 2
        end,
        id
    ) as rn
  from public.event_seating_units
  where event_date_id is null
)
delete from public.event_seating_units as u
using ranked as r
where u.id = r.id
  and r.rn > 1
  and u.status in ('available', 'blocked');

with ranked as (
  select
    id,
    status,
    row_number() over (
      partition by event_id, sector_id, layout_item_id, event_date_id
      order by
        case status
          when 'sold' then 0
          when 'reserved' then 1
          else 2
        end,
        id
    ) as rn
  from public.event_seating_units
  where event_date_id is not null
)
delete from public.event_seating_units as u
using ranked as r
where u.id = r.id
  and r.rn > 1
  and u.status in ('available', 'blocked');

with ranked as (
  select
    id,
    status,
    row_number() over (
      partition by event_id, sector_id, layout_item_id
      order by
        case status
          when 'sold' then 0
          when 'reserved' then 1
          else 2
        end,
        id
    ) as rn
  from public.event_seating_units
  where event_date_id is null
)
delete from public.event_seating_units as u
using ranked as r
where u.id = r.id
  and r.rn > 1
  and u.status in ('available', 'blocked');

create unique index if not exists event_seating_units_tier_day_layout_uidx
  on public.event_seating_units (event_id, tier_id, layout_item_id, event_date_id)
  where event_date_id is not null;

create unique index if not exists event_seating_units_tier_undated_layout_uidx
  on public.event_seating_units (event_id, tier_id, layout_item_id)
  where event_date_id is null;

create unique index if not exists event_seating_units_physical_day_uidx
  on public.event_seating_units (event_id, sector_id, layout_item_id, event_date_id)
  where event_date_id is not null;

create unique index if not exists event_seating_units_physical_undated_uidx
  on public.event_seating_units (event_id, sector_id, layout_item_id)
  where event_date_id is null;

-- ---------------------------------------------------------------------------
-- 2) Occupancy replica is per jornada
-- ---------------------------------------------------------------------------
alter table public.event_seating_occupancy
  add column if not exists event_date_id uuid;

create index if not exists event_seating_occupancy_event_day_idx
  on public.event_seating_occupancy (event_id, event_date_id);

create or replace function public.sync_event_seating_occupancy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.event_seating_occupancy where id = old.id;
    return old;
  end if;

  insert into public.event_seating_occupancy as occ (
    id,
    event_id,
    status,
    seating_sector_id,
    layout_item_id,
    event_date_id
  )
  values (
    new.id,
    new.event_id,
    new.status,
    new.sector_id,
    new.layout_item_id,
    new.event_date_id
  )
  on conflict (id) do update
    set event_id = excluded.event_id,
        status = excluded.status,
        seating_sector_id = excluded.seating_sector_id,
        layout_item_id = excluded.layout_item_id,
        event_date_id = excluded.event_date_id;

  return new;
end;
$$;

drop trigger if exists event_seating_units_occupancy_sync
  on public.event_seating_units;
create trigger event_seating_units_occupancy_sync
after insert or update of event_id, status, sector_id, layout_item_id, event_date_id
  or delete
on public.event_seating_units
for each row
execute function public.sync_event_seating_occupancy();

update public.event_seating_occupancy as occ
set event_date_id = u.event_date_id
from public.event_seating_units as u
where occ.id = u.id
  and occ.event_date_id is distinct from u.event_date_id;

create or replace view public.event_seating_occupancy_view
  with (security_invoker = true)
as
select
  id,
  event_id,
  status,
  seating_sector_id,
  layout_item_id,
  event_date_id
from public.event_seating_occupancy;

grant select on public.event_seating_occupancy_view to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Purge undated ghosts on multi-day events
-- ---------------------------------------------------------------------------
create or replace function public.purge_orphan_undated_seating_units(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_days integer := 0;
  v_deleted integer := 0;
begin
  if p_event_id is null then
    return 0;
  end if;

  select count(*)::integer
    into v_days
  from public.event_schedules
  where event_id = p_event_id;

  if coalesce(v_days, 0) < 2 then
    delete from public.event_seating_units as u
    where u.event_id = p_event_id
      and u.event_date_id is null
      and u.status in ('available', 'blocked')
      and exists (
        select 1
        from public.event_seating_units as d
        where d.event_id = u.event_id
          and d.tier_id = u.tier_id
          and d.layout_item_id = u.layout_item_id
          and d.event_date_id is not null
      );
    get diagnostics v_deleted = row_count;
    return v_deleted;
  end if;

  delete from public.event_seating_units
  where event_id = p_event_id
    and event_date_id is null
    and status in ('available', 'blocked');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_orphan_undated_seating_units(uuid)
  from public, anon;
grant execute on function public.purge_orphan_undated_seating_units(uuid)
  to authenticated, service_role;

comment on function public.purge_orphan_undated_seating_units(uuid) is
  'Removes undated available/blocked units when dated siblings exist, or all undated empties on 2+ jornadas.';

select public.purge_orphan_undated_seating_units(s.event_id)
from (
  select distinct event_id
  from public.event_schedules
) as s;

-- ---------------------------------------------------------------------------
-- 4) Force-skip layout apply must delete leftover empties for that day
-- ---------------------------------------------------------------------------
create or replace function public.clear_available_units_for_tier_day(
  p_tier_id uuid,
  p_event_date_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.event_seating_units
  where tier_id = p_tier_id
    and event_date_id is not distinct from p_event_date_id
    and status in ('available', 'blocked');
end;
$$;

revoke all on function public.clear_available_units_for_tier_day(uuid, uuid)
  from public, anon;
grant execute on function public.clear_available_units_for_tier_day(uuid, uuid)
  to authenticated, service_role;

create or replace function public.apply_seating_layout_to_tier(
  p_tier public.ticket_tiers,
  p_layout jsonb,
  p_event_date_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_venue_id uuid;
  v_layout jsonb := p_layout;
  v_sector jsonb;
  v_rows jsonb;
  v_row jsonb;
  v_item jsonb;
  v_item_status text;
  v_capacity integer;
  v_row_id text;
  v_row_number integer;
  v_row_label text;
  v_row_counter integer := 0;
  v_seen_ids text[] := '{}';
  v_force boolean;
begin
  v_force := coalesce(current_setting('tokepass.force_seating_sync', true), '') = 'on';

  if p_tier.layout_type = 'general'
     or nullif(btrim(coalesce(p_tier.seating_sector_id, '')), '') is null then
    perform public.clear_available_units_for_tier_day(p_tier.id, p_event_date_id);
    return 0;
  end if;

  select e.venue_id
    into v_venue_id
  from public.events as e
  where e.id = p_tier.event_id;

  if v_layout is null then
    v_layout := '[]'::jsonb;
  end if;
  if jsonb_typeof(v_layout) = 'object' then
    v_layout := jsonb_build_array(v_layout);
  end if;
  if jsonb_typeof(v_layout) <> 'array' then
    if v_force then
      perform public.clear_available_units_for_tier_day(p_tier.id, p_event_date_id);
      return 0;
    end if;
    raise exception 'SEATING_LAYOUT_INVALID' using errcode = '23514';
  end if;

  select value
    into v_sector
  from jsonb_array_elements(v_layout)
  where coalesce(value ->> 'id', value ->> 'sector_id')
    = p_tier.seating_sector_id
  limit 1;

  if v_sector is null then
    if v_force then
      perform public.clear_available_units_for_tier_day(p_tier.id, p_event_date_id);
      return 0;
    end if;
    raise exception 'SEATING_SECTOR_NOT_FOUND' using errcode = '23514';
  end if;

  v_capacity := greatest(
    1,
    least(
      100,
      coalesce(
        nullif(v_sector ->> 'default_capacity_per_unit', '')::integer,
        nullif(v_sector ->> 'capacity_per_unit', '')::integer,
        p_tier.capacity_per_unit,
        1
      )
    )
  );

  v_rows := v_sector -> 'rows';
  if jsonb_typeof(v_rows) = 'array' and jsonb_array_length(v_rows) > 0 then
    for v_row in
      select value
      from jsonb_array_elements(v_rows)
      order by coalesce((value ->> 'row_number')::integer, 0)
    loop
      v_row_counter := v_row_counter + 1;
      v_row_id := nullif(btrim(coalesce(v_row ->> 'row_id', '')), '');
      v_row_number := coalesce(
        nullif(v_row ->> 'row_number', '')::integer,
        v_row_counter
      );
      v_row_label := coalesce(
        nullif(btrim(v_row ->> 'row_label'), ''),
        'Fila ' || v_row_number::text
      );
      if v_row_id is null or jsonb_typeof(v_row -> 'items') <> 'array' then
        continue;
      end if;
      for v_item in
        select value from jsonb_array_elements(v_row -> 'items')
      loop
        if nullif(btrim(coalesce(v_item ->> 'id', '')), '') is null
           or nullif(btrim(coalesce(v_item ->> 'label', '')), '') is null then
          continue;
        end if;
        v_seen_ids := array_append(v_seen_ids, v_item ->> 'id');
        v_item_status := case
          when coalesce(v_item ->> 'status', 'available') = 'blocked'
            then 'blocked'
          else 'available'
        end;
        perform public.upsert_event_seating_unit_row(
          p_tier.event_id,
          v_venue_id,
          p_tier.id,
          p_event_date_id,
          p_tier.seating_sector_id,
          coalesce(
            nullif(btrim(v_sector ->> 'sector_name'), ''),
            nullif(btrim(v_sector ->> 'name'), ''),
            p_tier.name
          ),
          v_item ->> 'id',
          v_item ->> 'label',
          v_row_id,
          v_row_number,
          v_row_label,
          coalesce(nullif(v_sector ->> 'color', ''), '#10B981'),
          p_tier.layout_type,
          greatest(
            1,
            least(
              100,
              coalesce(nullif(v_item ->> 'capacity', '')::integer, v_capacity)
            )
          ),
          v_item_status
        );
      end loop;
    end loop;
  elsif jsonb_typeof(v_sector -> 'items') = 'array' then
    for v_item in
      select value from jsonb_array_elements(v_sector -> 'items')
    loop
      if nullif(btrim(coalesce(v_item ->> 'id', '')), '') is null
         or nullif(btrim(coalesce(v_item ->> 'label', '')), '') is null then
        continue;
      end if;
      v_seen_ids := array_append(v_seen_ids, v_item ->> 'id');
      v_item_status := case
        when coalesce(v_item ->> 'status', 'available') = 'blocked'
          then 'blocked'
        else 'available'
      end;
      perform public.upsert_event_seating_unit_row(
        p_tier.event_id,
        v_venue_id,
        p_tier.id,
        p_event_date_id,
        p_tier.seating_sector_id,
        coalesce(
          nullif(btrim(v_sector ->> 'sector_name'), ''),
          nullif(btrim(v_sector ->> 'name'), ''),
          p_tier.name
        ),
        v_item ->> 'id',
        v_item ->> 'label',
        null,
        null,
        null,
        coalesce(nullif(v_sector ->> 'color', ''), '#10B981'),
        p_tier.layout_type,
        greatest(
          1,
          least(
            100,
            coalesce(nullif(v_item ->> 'capacity', '')::integer, v_capacity)
          )
        ),
        v_item_status
      );
    end loop;
  end if;

  if cardinality(v_seen_ids) = 0 then
    if v_force then
      perform public.clear_available_units_for_tier_day(p_tier.id, p_event_date_id);
      return 0;
    end if;
    raise exception 'SEATING_SECTOR_EMPTY' using errcode = '23514';
  end if;

  delete from public.event_seating_units as u
  where u.tier_id = p_tier.id
    and u.event_date_id is not distinct from p_event_date_id
    and u.status in ('available', 'blocked')
    and not (u.layout_item_id = any (v_seen_ids));

  return cardinality(v_seen_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Materialize always purges undated leftovers after the map pass
-- ---------------------------------------------------------------------------
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
  v_has_plan boolean := false;
begin
  v_result := public.publish_event_v2_core(p_event_id, p_payload);
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
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Hold: 2+ jornadas require exact unit.event_date_id
-- ---------------------------------------------------------------------------
create or replace function public.hold_seating_unit_for_cart_by_layout(
  p_event_id uuid,
  p_owner_id uuid,
  p_sector_id text,
  p_layout_item_id text,
  p_event_date_id uuid default null
)
returns table (seating_unit_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit_id uuid;
  v_schedule_days integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_sector_id is null or btrim(p_sector_id) = ''
     or p_layout_item_id is null or btrim(p_layout_item_id) = '' then
    raise exception 'SEATING_UNIT_NOT_MATERIALIZED' using errcode = 'P0002';
  end if;

  select count(*)::integer
    into v_schedule_days
  from public.event_schedules
  where event_id = p_event_id;

  if coalesce(v_schedule_days, 0) >= 2 and p_event_date_id is null then
    raise exception 'missing_event_date_id' using errcode = 'P0001';
  end if;

  if p_event_date_id is not null
     and not exists (
       select 1
       from public.event_schedules as s
       where s.id = p_event_date_id
         and s.event_id = p_event_id
     ) then
    raise exception 'missing_event_date_id' using errcode = 'P0001';
  end if;

  select u.id
    into v_unit_id
  from public.event_seating_units as u
  left join public.ticket_tiers as t on t.id = u.tier_id
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and u.layout_item_id = p_layout_item_id
    and (
      case
        when coalesce(v_schedule_days, 0) >= 2 then
          u.event_date_id = p_event_date_id
        else
          p_event_date_id is null
          or coalesce(u.event_date_id, t.day_id) is null
          or coalesce(u.event_date_id, t.day_id) = p_event_date_id
      end
    )
  order by
    case when u.status in ('available', 'reserved') then 0 else 1 end,
    u.id
  limit 1;

  if v_unit_id is null then
    raise exception 'SEATING_UNIT_NOT_MATERIALIZED' using errcode = 'P0002';
  end if;

  return query
  select *
  from public.hold_seating_unit_for_cart(
    p_event_id,
    p_owner_id,
    v_unit_id
  );
end;
$$;

comment on function public.hold_seating_unit_for_cart_by_layout(uuid, uuid, text, text, uuid) is
  'Resuelve layout_item_id a una unidad. En 2+ jornadas exige event_date_id exacto; no usa unidades sin fecha.';

-- ---------------------------------------------------------------------------
-- 7) Cart normalize: same exact-day rule
-- ---------------------------------------------------------------------------
create or replace function public.normalize_checkout_cart_items(
  p_event_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_tier_id uuid;
  v_seat_id uuid;
  v_element_id text;
  v_event_date_id uuid;
  v_type text;
  v_quantity integer;
  v_resolved uuid;
  v_day_count integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVENTORY_CONFLICT_409'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_tier_id := public.checkout_cart_item_tier_id(v_item);
    v_seat_id := public.checkout_cart_item_seat_id(v_item);
    v_element_id := nullif(btrim(coalesce(
      v_item ->> 'element_id',
      v_item ->> 'elementId',
      ''
    )), '');
    v_event_date_id := null;
    begin
      v_event_date_id := nullif(btrim(coalesce(
        v_item ->> 'event_date_id',
        v_item ->> 'eventDateId',
        v_item ->> 'dateId',
        ''
      )), '')::uuid;
    exception
      when others then
        v_event_date_id := null;
    end;
    v_type := lower(nullif(btrim(coalesce(v_item ->> 'type', '')), ''));
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_type is null then
      v_type := case
        when v_seat_id is not null or v_element_id is not null then 'mapped'
        else 'general'
      end;
    end if;

    if v_type = 'mapped' then
      v_quantity := 1;

      if v_day_count >= 2 and v_event_date_id is null then
        raise exception 'INVENTORY_CONFLICT_409'
          using errcode = 'P0001';
      end if;

      if v_event_date_id is not null
         and not exists (
           select 1
           from public.event_schedules as s
           where s.id = v_event_date_id
             and s.event_id = p_event_id
         ) then
        raise exception 'INVENTORY_CONFLICT_409'
          using errcode = 'P0001';
      end if;

      if v_seat_id is not null
         and not exists (
           select 1
           from public.event_seating_units as u
           where u.id = v_seat_id
             and u.event_id = p_event_id
             and (
               case
                 when v_day_count >= 2 then
                   u.event_date_id = v_event_date_id
                 else
                   v_event_date_id is null
                   or u.event_date_id is not distinct from v_event_date_id
               end
             )
             and (
               v_element_id is null
               or u.layout_item_id is null
               or u.layout_item_id = v_element_id
             )
         ) then
        v_seat_id := null;
      end if;

      if v_seat_id is null and v_element_id is not null then
        select u.id
          into v_resolved
        from public.event_seating_units as u
        where u.event_id = p_event_id
          and u.layout_item_id = v_element_id
          and (
            case
              when v_day_count >= 2 then
                u.event_date_id = v_event_date_id
              else
                v_event_date_id is null
                or u.event_date_id is not distinct from v_event_date_id
            end
          )
        limit 1;
        if v_resolved is null then
          raise exception 'INVENTORY_CONFLICT_409'
            using errcode = 'P0001';
        end if;
        v_seat_id := v_resolved;
      end if;

      if v_seat_id is null then
        raise exception 'INVENTORY_CONFLICT_409'
          using errcode = 'P0001';
      end if;
    end if;

    if v_tier_id is null or v_quantity <= 0 then
      raise exception 'Cada item requiere ticket_tier_id y quantity > 0'
        using errcode = '22023';
    end if;

    v_out := v_out || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'type', v_type,
          'ticket_tier_id', v_tier_id,
          'tier_id', v_tier_id,
          'quantity', v_quantity,
          'seating_unit_id', v_seat_id,
          'seat_id', v_seat_id,
          'element_id', v_element_id,
          'event_date_id', v_event_date_id,
          'sector_key', nullif(btrim(coalesce(v_item ->> 'sector_key', '')), ''),
          'table_number', nullif(v_item ->> 'table_number', '')::integer,
          'zone_id', nullif(v_item ->> 'zone_id', '')::uuid,
          'phase_id', nullif(v_item ->> 'phase_id', '')::uuid
        )
      )
    );
  end loop;

  return v_out;
end;
$$;

comment on function public.normalize_checkout_cart_items(uuid, jsonb) is
  'Normaliza items general/mapped. En 2+ jornadas resuelve layout_item_id solo contra unidades de esa fecha.';

-- ---------------------------------------------------------------------------
-- 8) Public unit RPCs: day parameter, empty on multi-day without a day
-- ---------------------------------------------------------------------------
drop function if exists public.get_event_seating_units_by_sector(uuid, text);
drop function if exists public.get_event_seating_units_by_sector(uuid, text, uuid);
drop function if exists public.get_event_seating_availability(uuid);
drop function if exists public.get_event_seating_availability(uuid, uuid);

create function public.get_event_seating_units_by_sector(
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
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and tt.visibility = 'public'
    and (
      p_event_date_id is null
      or u.event_date_id = p_event_date_id
    )
  order by
    u.row_number nulls last,
    u.row_label nulls last,
    u.label;
end;
$$;

create function public.get_event_seating_availability(
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
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and tt.visibility = 'public'
    and (
      p_event_date_id is null
      or u.event_date_id = p_event_date_id
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

comment on function public.get_event_seating_units_by_sector(uuid, text, uuid) is
  'Lazy sector inventory for one jornada. Multi-day without p_event_date_id returns nothing.';
comment on function public.get_event_seating_availability(uuid, uuid) is
  'Full-event seating occupancy for one jornada. Multi-day without p_event_date_id returns nothing.';
