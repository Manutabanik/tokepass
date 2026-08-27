-- P173 · Inventory units come from seating_maps, one row per jornada.
-- The old unique (event_id, sector_id, layout_item_id) made Friday mesa-09
-- collide with Saturday. Materialize used venues.seating_layout (first day).

alter table public.seating_maps
  add column if not exists seating_layout jsonb not null default '[]'::jsonb;

comment on column public.seating_maps.seating_layout is
  'Sectors/items used to materialize event_seating_units for this jornada.';

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint as c
    join pg_class as t on t.oid = c.conrelid
    join pg_namespace as n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'event_seating_units'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%tier_id%'
      and pg_get_constraintdef(c.oid) ilike '%layout_item_id%'
      and pg_get_constraintdef(c.oid) not ilike '%event_date_id%'
  loop
    execute format(
      'alter table public.event_seating_units drop constraint if exists %I',
      r.conname
    );
  end loop;
end
$$;

drop index if exists public.event_seating_units_physical_unit_key;

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
begin
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

  insert into public.event_seating_units (
    event_id, venue_id, tier_id, event_date_id, sector_id, sector_name,
    layout_item_id, label, row_id, row_number, row_label,
    color, layout_type, capacity_per_unit, status
  )
  values (
    p_event_id,
    p_venue_id,
    p_tier_id,
    p_event_date_id,
    p_sector_id,
    p_sector_name,
    p_layout_item_id,
    p_label,
    p_row_id,
    p_row_number,
    p_row_label,
    p_color,
    p_layout_type,
    p_capacity,
    p_status
  );
end;
$$;

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
    delete from public.event_seating_units as u
    where u.tier_id = p_tier.id
      and u.event_date_id is not distinct from p_event_date_id
      and u.status in ('available', 'blocked');
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

create or replace function public.layout_for_event_seating_tier(
  p_event_id uuid,
  p_day_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_layout jsonb;
  v_venue_layout jsonb;
begin
  select sm.seating_layout
    into v_layout
  from public.seating_maps as sm
  where sm.event_id = p_event_id
    and sm.event_date_id is not distinct from p_day_id
    and jsonb_typeof(sm.seating_layout) = 'array'
    and jsonb_array_length(sm.seating_layout) > 0
  order by sm.updated_at desc
  limit 1;

  if v_layout is not null then
    return v_layout;
  end if;

  select v.seating_layout
    into v_venue_layout
  from public.events as e
  left join public.venues as v on v.id = e.venue_id
  where e.id = p_event_id;

  return v_venue_layout;
end;
$$;

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
    return v_count;
  end if;

  update public.ticket_tiers as tt
  set seating_sector_id = tt.seating_sector_id
  where tt.event_id = p_event_id
    and tt.layout_type <> 'general'
    and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.materialize_event_seating_units(uuid) is
  'Genera event_seating_units desde seating_maps (por jornada). Fallback: venues.seating_layout.';

create or replace function public.sync_published_seating_maps(
  p_event_id uuid,
  p_maps jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_day uuid;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_day_count integer := 0;
  v_layout jsonb;
begin
  if p_event_id is null then
    raise exception 'Evento inválido' using errcode = '22023';
  end if;

  select count(*)::integer
    into v_day_count
  from public.event_schedules
  where event_id = p_event_id;

  if p_maps is null
     or jsonb_typeof(p_maps) <> 'array'
     or jsonb_array_length(p_maps) = 0 then
    delete from public.seating_maps
    where event_id = p_event_id;
    return;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_maps)
  loop
    v_id := null;
    v_day := null;
    begin
      v_day := nullif(btrim(coalesce(v_item ->> 'event_date_id', '')), '')::uuid;
    exception
      when others then
        v_day := null;
    end;

    if v_day is not null
       and not exists (
         select 1
         from public.event_schedules as s
         where s.id = v_day
           and s.event_id = p_event_id
       ) then
      if v_day_count >= 2 then
        raise exception 'El mapa de una jornada no coincide con el cronograma'
          using errcode = '22023';
      end if;
      v_day := null;
    end if;

    v_layout := case
      when jsonb_typeof(v_item -> 'seating_layout') = 'array'
        then v_item -> 'seating_layout'
      else '[]'::jsonb
    end;

    if v_day is not null then
      update public.seating_maps
      set
        map_config = coalesce(v_item -> 'map_config', '{}'::jsonb),
        pricing = coalesce(v_item -> 'pricing', '{}'::jsonb),
        seating_layout = v_layout,
        updated_at = now()
      where event_id = p_event_id
        and event_date_id = v_day
      returning id into v_id;
    else
      update public.seating_maps
      set
        map_config = coalesce(v_item -> 'map_config', '{}'::jsonb),
        pricing = coalesce(v_item -> 'pricing', '{}'::jsonb),
        seating_layout = v_layout,
        updated_at = now()
      where event_id = p_event_id
        and event_date_id is null
      returning id into v_id;
    end if;

    if v_id is null then
      insert into public.seating_maps (
        event_id,
        event_date_id,
        map_config,
        pricing,
        seating_layout
      )
      values (
        p_event_id,
        v_day,
        coalesce(v_item -> 'map_config', '{}'::jsonb),
        coalesce(v_item -> 'pricing', '{}'::jsonb),
        v_layout
      )
      returning id into v_id;
    end if;

    v_keep := array_append(v_keep, v_id);
  end loop;

  delete from public.seating_maps
  where event_id = p_event_id
    and not (id = any (v_keep));
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
  end if;
  return v_result;
end;
$$;

revoke all on function public.upsert_event_seating_unit_row(
  uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text, text, integer, text
) from public, anon;
grant execute on function public.upsert_event_seating_unit_row(
  uuid, uuid, uuid, uuid, text, text, text, text, text, integer, text, text, text, integer, text
) to service_role;

revoke all on function public.apply_seating_layout_to_tier(public.ticket_tiers, jsonb, uuid)
  from public, anon;
grant execute on function public.apply_seating_layout_to_tier(public.ticket_tiers, jsonb, uuid)
  to authenticated, service_role;

revoke all on function public.layout_for_event_seating_tier(uuid, uuid)
  from public, anon;
grant execute on function public.layout_for_event_seating_tier(uuid, uuid)
  to authenticated, service_role;
