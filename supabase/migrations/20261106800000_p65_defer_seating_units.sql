-- =============================================================================
-- P65 - Deferred seating unit materialization (Adaptive Seating Engine).
-- Autosave persists venue_map / seating_layout JSON only.
-- event_seating_units is created on publish or when a published event
-- assigns seating_sector_id (or via materialize_event_seating_units).
-- =============================================================================

create or replace function public.sync_event_seating_units_from_tier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
  v_layout jsonb;
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
begin
  if coalesce(current_setting('tokepass.skip_seating_sync', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(current_setting('tokepass.force_seating_sync', true), '') <> 'on'
     and old.layout_type is not distinct from new.layout_type
     and old.seating_sector_id is not distinct from new.seating_sector_id
     and old.capacity_per_unit is not distinct from new.capacity_per_unit then
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

  if new.layout_type = 'general'
     or nullif(btrim(coalesce(new.seating_sector_id, '')), '') is null then
    delete from public.event_seating_units as u
    where u.tier_id = new.id
      and u.status in ('available', 'blocked');
    return new;
  end if;

  select e.venue_id, v.seating_layout
    into v_venue_id, v_layout
  from public.events as e
  left join public.venues as v on v.id = e.venue_id
  where e.id = new.event_id;

  if v_venue_id is null or v_layout is null then
    raise exception 'SEATING_LAYOUT_NOT_FOUND' using errcode = '23514';
  end if;

  if jsonb_typeof(v_layout) = 'object' then
    v_layout := jsonb_build_array(v_layout);
  end if;
  if jsonb_typeof(v_layout) <> 'array' then
    raise exception 'SEATING_LAYOUT_INVALID' using errcode = '23514';
  end if;

  select value into v_sector
  from jsonb_array_elements(v_layout)
  where coalesce(value ->> 'id', value ->> 'sector_id')
    = new.seating_sector_id
  limit 1;

  if v_sector is null then
    raise exception 'SEATING_SECTOR_NOT_FOUND' using errcode = '23514';
  end if;
  if coalesce(v_sector ->> 'layout_type', '') <> new.layout_type then
    raise exception 'SEATING_LAYOUT_TYPE_MISMATCH' using errcode = '23514';
  end if;

  v_capacity := greatest(
    1,
    least(
      100,
      coalesce(
        nullif(v_sector ->> 'default_capacity_per_unit', '')::integer,
        nullif(v_sector ->> 'capacity_per_unit', '')::integer,
        new.capacity_per_unit,
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

        insert into public.event_seating_units (
          event_id, venue_id, tier_id, sector_id, sector_name,
          layout_item_id, label, row_id, row_number, row_label,
          color, layout_type, capacity_per_unit, status
        )
        values (
          new.event_id,
          v_venue_id,
          new.id,
          new.seating_sector_id,
          coalesce(
            nullif(btrim(v_sector ->> 'sector_name'), ''),
            nullif(btrim(v_sector ->> 'name'), ''),
            new.name
          ),
          v_item ->> 'id',
          v_item ->> 'label',
          v_row_id,
          v_row_number,
          v_row_label,
          coalesce(nullif(v_sector ->> 'color', ''), '#10B981'),
          new.layout_type,
          greatest(
            1,
            least(
              100,
              coalesce(
                nullif(v_item ->> 'capacity', '')::integer,
                v_capacity
              )
            )
          ),
          v_item_status
        )
        on conflict (event_id, tier_id, layout_item_id)
        do update set
          sector_id = excluded.sector_id,
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

      insert into public.event_seating_units (
        event_id, venue_id, tier_id, sector_id, sector_name,
        layout_item_id, label, row_id, row_number, row_label,
        color, layout_type, capacity_per_unit, status
      )
      values (
        new.event_id,
        v_venue_id,
        new.id,
        new.seating_sector_id,
        coalesce(
          nullif(btrim(v_sector ->> 'sector_name'), ''),
          nullif(btrim(v_sector ->> 'name'), ''),
          new.name
        ),
        v_item ->> 'id',
        v_item ->> 'label',
        null,
        null,
        null,
        coalesce(nullif(v_sector ->> 'color', ''), '#10B981'),
        new.layout_type,
        greatest(
          1,
          least(
            100,
            coalesce(nullif(v_item ->> 'capacity', '')::integer, v_capacity)
          )
        ),
        v_item_status
      )
      on conflict (event_id, tier_id, layout_item_id)
      do update set
        sector_name = excluded.sector_name,
        label = excluded.label,
        row_id = null,
        row_number = null,
        row_label = null,
        color = excluded.color,
        capacity_per_unit = excluded.capacity_per_unit,
        status = case
          when event_seating_units.status in ('sold', 'reserved')
            then event_seating_units.status
          else excluded.status
        end,
        updated_at = now();
    end loop;
  end if;

  if cardinality(v_seen_ids) = 0 then
    raise exception 'SEATING_SECTOR_EMPTY' using errcode = '23514';
  end if;

  delete from public.event_seating_units as u
  where u.tier_id = new.id
    and u.status in ('available', 'blocked')
    and not (u.layout_item_id = any(v_seen_ids));

  return new;
end;
$$;

create or replace function public.resync_event_seating_after_venue_layout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- JSON-only persistence. Units are materialized on publish or explicit
  -- seating_sector_id assignment (see materialize_event_seating_units).
  return new;
end;
$$;

create or replace function public.materialize_event_seating_units(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
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
  'Genera event_seating_units desde venues.seating_layout. Usar al publicar, no en autosave.';

revoke all on function public.materialize_event_seating_units(uuid) from public;
grant execute on function public.materialize_event_seating_units(uuid)
  to authenticated, service_role;
