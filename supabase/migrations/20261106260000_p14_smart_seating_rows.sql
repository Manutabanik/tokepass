-- =============================================================================
-- P14 - Universal Smart Seating: asymmetric row-by-row venue layouts.
-- Keeps P13 atomic locks while enriching each sellable unit with row geometry.
-- =============================================================================

alter table public.event_seating_units
  add column if not exists row_id text,
  add column if not exists row_number integer,
  add column if not exists row_label text;

alter table public.event_seating_units
  drop constraint if exists event_seating_units_row_number_check;
alter table public.event_seating_units
  add constraint event_seating_units_row_number_check
  check (row_number is null or row_number > 0);

create index if not exists event_seating_units_row_idx
  on public.event_seating_units(event_id, tier_id, row_number, layout_item_id);

comment on column public.event_seating_units.row_id is
  'Identificador estable de la fila asimétrica definida en venues.seating_layout.';
comment on column public.event_seating_units.row_label is
  'Nombre libre de la fila mostrado en el selector y QR maestro.';

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
    -- Backward compatibility for P13 flat sectors.
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
  update public.ticket_tiers as tt
  set seating_sector_id = tt.seating_sector_id
  from public.events as e
  where e.venue_id = new.id
    and tt.event_id = e.id
    and tt.layout_type <> 'general'
    and tt.seating_sector_id is not null;
  return new;
end;
$$;

drop trigger if exists resync_event_seating_after_venue_layout
  on public.venues;
create trigger resync_event_seating_after_venue_layout
after update of seating_layout on public.venues
for each row
when (old.seating_layout is distinct from new.seating_layout)
execute function public.resync_event_seating_after_venue_layout();

drop function if exists public.get_event_seating_availability(uuid);
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
  reserved_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  if not exists (
    select 1 from public.events as e
    where e.id = p_event_id
      and e.status = 'published'::public.event_status
  ) then
    return;
  end if;

  for v_order_id in
    select distinct u.reserved_order_id
    from public.event_seating_units as u
    where u.event_id = p_event_id
      and u.status = 'reserved'
      and u.reserved_until <= now()
      and u.reserved_order_id is not null
  loop
    perform public.expire_seating_order(v_order_id);
  end loop;

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
    u.status,
    case when u.status = 'reserved' then u.reserved_until else null end
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

revoke all on function public.get_event_seating_availability(uuid) from public;
grant execute on function public.get_event_seating_availability(uuid)
  to anon, authenticated, service_role;
