-- =============================================================================
-- P83: Normalizacion de jornadas (event_schedules) + self-heal de holds
--  1) JSONB events.schedule_days -> tabla relacional con FK en ticket_tiers.day_id
--  2) Lecturas de stock liberan holds expirados (GA + seating) sin depender del Cron
-- El Cron /api/cron/expire-orders sigue como barrido; ya no es el unico camino.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabla relacional de jornadas
-- -----------------------------------------------------------------------------
create table if not exists public.event_schedules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null default 'Jornada',
  start_time timestamptz not null,
  end_time timestamptz not null,
  constraint event_schedules_window_check check (end_time > start_time)
);

create index if not exists event_schedules_event_start_idx
  on public.event_schedules (event_id, start_time);

comment on table public.event_schedules is
  'Jornadas canónicas del evento. events.schedule_days se mantiene como espejo JSONB.';

alter table public.event_schedules enable row level security;

drop policy if exists event_schedules_select_visible on public.event_schedules;
create policy event_schedules_select_visible
  on public.event_schedules
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.events as e
      where e.id = event_schedules.event_id
        and (
          (
            e.status in (
              'published'::public.event_status,
              'paused'::public.event_status
            )
            and e.visibility in ('public', 'private')
          )
          or e.organizer_id = auth.uid()
          or public.is_super_admin()
        )
    )
  );

grant select on public.event_schedules to anon, authenticated, service_role;

create or replace function public.try_parse_schedule_timestamptz(p_raw text)
returns timestamptz
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if p_raw is null or btrim(p_raw) = '' then
    return null;
  end if;
  return btrim(p_raw)::timestamptz;
exception
  when others then
    return null;
end;
$$;

create or replace function public.event_schedules_as_jsonb(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id::text,
        'title', s.title,
        'start_time', s.start_time,
        'end_time', s.end_time
      )
      order by s.start_time, s.id
    ),
    '[]'::jsonb
  )
  from public.event_schedules as s
  where s.event_id = p_event_id;
$$;

revoke all on function public.event_schedules_as_jsonb(uuid) from public;
grant execute on function public.event_schedules_as_jsonb(uuid)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2) Backfill JSONB -> event_schedules y remap de ticket_tiers.day_id
-- -----------------------------------------------------------------------------
do $$
declare
  v_event record;
  v_elem jsonb;
  v_raw_id text;
  v_title text;
  v_start timestamptz;
  v_end timestamptz;
  v_new_id uuid;
  v_existing uuid;
begin
  create temporary table if not exists p83_day_remap (
    event_id uuid not null,
    old_id text not null,
    new_id uuid not null,
    primary key (event_id, old_id)
  ) on commit drop;

  for v_event in
    select
      e.id,
      e.date,
      e.schedule_days
    from public.events as e
  loop
    if jsonb_typeof(coalesce(v_event.schedule_days, '[]'::jsonb)) = 'array' then
      for v_elem in
        select value
        from jsonb_array_elements(coalesce(v_event.schedule_days, '[]'::jsonb))
      loop
        v_raw_id := nullif(btrim(coalesce(v_elem ->> 'id', '')), '');
        if v_raw_id is null or public.ticket_day_is_full_pass(v_raw_id) then
          continue;
        end if;

        v_title := coalesce(
          nullif(btrim(coalesce(v_elem ->> 'title', v_elem ->> 'name', v_elem ->> 'label')), ''),
          'Jornada'
        );
        v_start := public.try_parse_schedule_timestamptz(
          coalesce(v_elem ->> 'start_time', v_elem ->> 'startTime')
        );
        v_end := public.try_parse_schedule_timestamptz(
          coalesce(v_elem ->> 'end_time', v_elem ->> 'endTime')
        );
        if v_start is null or v_end is null or v_end <= v_start then
          continue;
        end if;

        if v_raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_new_id := v_raw_id::uuid;
        else
          v_new_id := gen_random_uuid();
        end if;

        select s.id
          into v_existing
        from public.event_schedules as s
        where s.id = v_new_id
        limit 1;

        if v_existing is not null then
          update public.event_schedules
          set
            title = v_title,
            start_time = v_start,
            end_time = v_end
          where id = v_new_id
            and event_id = v_event.id;

          if not found then
            v_new_id := gen_random_uuid();
            insert into public.event_schedules (id, event_id, title, start_time, end_time)
            values (v_new_id, v_event.id, v_title, v_start, v_end);
          end if;
        else
          insert into public.event_schedules (id, event_id, title, start_time, end_time)
          values (v_new_id, v_event.id, v_title, v_start, v_end);
        end if;

        insert into p83_day_remap (event_id, old_id, new_id)
        values (v_event.id, v_raw_id, v_new_id)
        on conflict (event_id, old_id) do update
          set new_id = excluded.new_id;
      end loop;
    end if;
  end loop;

  -- Tiers huérfanos: crear jornada placeholder para no perder el vínculo.
  -- day_id puede ser text (schema P12) o uuid (re-run tras ALTER de este archivo).
  insert into p83_day_remap (event_id, old_id, new_id)
  select
    tt.event_id,
    btrim(tt.day_id::text),
    case
      when btrim(tt.day_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then btrim(tt.day_id::text)::uuid
      else gen_random_uuid()
    end
  from public.ticket_tiers as tt
  where tt.day_id is not null
    and not public.ticket_day_is_full_pass(tt.day_id::text)
    and not exists (
      select 1
      from p83_day_remap as r
      where r.event_id = tt.event_id
        and r.old_id = btrim(tt.day_id::text)
    )
  on conflict (event_id, old_id) do nothing;

  update p83_day_remap as r
  set new_id = gen_random_uuid()
  from public.event_schedules as s
  where s.id = r.new_id
    and s.event_id is distinct from r.event_id;

  insert into public.event_schedules (id, event_id, title, start_time, end_time)
  select
    r.new_id,
    r.event_id,
    'Jornada (migrada)',
    coalesce(e.date, clock_timestamp()),
    coalesce(e.date, clock_timestamp()) + interval '8 hours'
  from p83_day_remap as r
  join public.events as e on e.id = r.event_id
  where not exists (
    select 1 from public.event_schedules as s where s.id = r.new_id
  );

  update public.ticket_tiers as tt
  set day_id = r.new_id
  from p83_day_remap as r
  where tt.event_id = r.event_id
    and btrim(tt.day_id::text) = r.old_id
    and tt.day_id::text is distinct from r.new_id::text;

  update public.ticket_tiers
  set day_id = null
  where public.ticket_day_is_full_pass(day_id::text);
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = 'ticket_tiers'
      and c.column_name = 'day_id'
      and c.data_type = 'uuid'
  ) then
    return;
  end if;

  alter table public.ticket_tiers
    alter column day_id type uuid
    using (
      case
        when day_id is null then null
        when public.ticket_day_is_full_pass(day_id::text) then null
        when day_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then day_id::text::uuid
        else null
      end
    );
end
$$;

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_day_id_fkey;

alter table public.ticket_tiers
  add constraint ticket_tiers_day_id_fkey
  foreign key (day_id)
  references public.event_schedules (id)
  on update cascade
  on delete no action
  deferrable initially deferred;

create index if not exists ticket_tiers_day_id_idx
  on public.ticket_tiers (day_id)
  where day_id is not null;

comment on column public.ticket_tiers.day_id is
  'NULL = abono / fecha única. Si no, FK a event_schedules.id (RESTRICT diferido).';

comment on column public.events.schedule_days is
  'Espejo JSONB de event_schedules para compatibilidad. La fuente canónica es relacional.';

-- Overload: day_id ahora es uuid.
create or replace function public.ticket_day_is_full_pass(p_day_id uuid)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p_day_id is null;
$$;

revoke all on function public.ticket_day_is_full_pass(uuid) from public;
grant execute on function public.ticket_day_is_full_pass(uuid)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Sync bidireccional JSONB <-> event_schedules (transición)
-- -----------------------------------------------------------------------------
create or replace function public.sync_event_schedules_from_jsonb()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_elem jsonb;
  v_raw_id text;
  v_title text;
  v_start timestamptz;
  v_end timestamptz;
  v_new_id uuid;
  v_keep uuid[] := '{}';
  v_blocked text;
  v_json jsonb;
begin
  if current_setting('tokepass.syncing_schedules', true) = '1' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.schedule_days is not distinct from new.schedule_days then
    return new;
  end if;

  perform set_config('tokepass.syncing_schedules', '1', true);

  if jsonb_typeof(coalesce(new.schedule_days, '[]'::jsonb)) <> 'array' then
    perform set_config('tokepass.syncing_schedules', '0', true);
    raise exception 'schedule_days debe ser un arreglo JSON'
      using errcode = '22023';
  end if;

  for v_elem in
    select value
    from jsonb_array_elements(coalesce(new.schedule_days, '[]'::jsonb))
  loop
    v_raw_id := nullif(btrim(coalesce(v_elem ->> 'id', '')), '');
    if v_raw_id is not null and public.ticket_day_is_full_pass(v_raw_id) then
      continue;
    end if;

    v_title := coalesce(
      nullif(btrim(coalesce(v_elem ->> 'title', v_elem ->> 'name', v_elem ->> 'label')), ''),
      'Jornada'
    );
    v_start := public.try_parse_schedule_timestamptz(
      coalesce(v_elem ->> 'start_time', v_elem ->> 'startTime')
    );
    v_end := public.try_parse_schedule_timestamptz(
      coalesce(v_elem ->> 'end_time', v_elem ->> 'endTime')
    );
    if v_start is null or v_end is null or v_end <= v_start then
      continue;
    end if;

    if v_raw_id is not null
       and v_raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_new_id := v_raw_id::uuid;
    else
      v_new_id := gen_random_uuid();
    end if;

    if exists (
      select 1
      from public.event_schedules as s
      where s.id = v_new_id
        and s.event_id is distinct from new.id
    ) then
      v_new_id := gen_random_uuid();
    end if;

    insert into public.event_schedules (id, event_id, title, start_time, end_time)
    values (v_new_id, new.id, v_title, v_start, v_end)
    on conflict (id) do update
      set
        title = excluded.title,
        start_time = excluded.start_time,
        end_time = excluded.end_time
      where public.event_schedules.event_id = excluded.event_id;

    v_keep := array_append(v_keep, v_new_id);
  end loop;

  select string_agg(s.title, ', ' order by s.start_time)
    into v_blocked
  from public.event_schedules as s
  where s.event_id = new.id
    and not (s.id = any (v_keep))
    and exists (
      select 1
      from public.ticket_tiers as tt
      where tt.day_id = s.id
    );

  if v_blocked is not null then
    perform set_config('tokepass.syncing_schedules', '0', true);
    raise exception
      'No se puede eliminar una jornada con tickets asociados: %',
      v_blocked
      using errcode = '23503';
  end if;

  delete from public.event_schedules as s
  where s.event_id = new.id
    and not (s.id = any (v_keep));

  v_json := public.event_schedules_as_jsonb(new.id);
  if new.schedule_days is distinct from v_json then
    update public.events
    set schedule_days = v_json
    where id = new.id;
  end if;

  perform set_config('tokepass.syncing_schedules', '0', true);
  return new;
end;
$$;

create or replace function public.sync_jsonb_from_event_schedules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_id uuid;
begin
  if current_setting('tokepass.syncing_schedules', true) = '1' then
    return coalesce(new, old);
  end if;

  v_event_id := coalesce(new.event_id, old.event_id);
  perform set_config('tokepass.syncing_schedules', '1', true);
  update public.events
  set
    schedule_days = public.event_schedules_as_jsonb(v_event_id),
    updated_at = now()
  where id = v_event_id;
  perform set_config('tokepass.syncing_schedules', '0', true);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_events_sync_schedules on public.events;
create trigger trg_events_sync_schedules
  after insert or update of schedule_days
  on public.events
  for each row
  execute function public.sync_event_schedules_from_jsonb();

drop trigger if exists trg_event_schedules_mirror_jsonb on public.event_schedules;
create trigger trg_event_schedules_mirror_jsonb
  after insert or update or delete
  on public.event_schedules
  for each row
  execute function public.sync_jsonb_from_event_schedules();

-- Reescribir espejo JSONB desde filas migradas.
do $$
declare
  v_id uuid;
begin
  perform set_config('tokepass.syncing_schedules', '1', true);
  for v_id in select distinct event_id from public.event_schedules
  loop
    update public.events
    set schedule_days = public.event_schedules_as_jsonb(v_id)
    where id = v_id;
  end loop;
  perform set_config('tokepass.syncing_schedules', '0', true);
end
$$;

-- -----------------------------------------------------------------------------
-- 4) Self-heal: liberar holds expirados al consultar / reservar stock
-- -----------------------------------------------------------------------------
create or replace function public.seating_unit_live_status(
  p_status text,
  p_reserved_until timestamptz
)
returns text
language sql
volatile
set search_path = pg_catalog, public
as $$
  select case
    when p_status = 'reserved'
         and p_reserved_until is not null
         and p_reserved_until <= clock_timestamp()
      then 'available'
    else p_status
  end;
$$;

create or replace function public.purge_expired_checkout_holds(p_event_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_row public.event_ga_cart_holds%rowtype;
  v_order_id uuid;
  v_seating integer := 0;
begin
  if p_event_id is null
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'p_event_id es requerido'
      using errcode = '22023';
  end if;

  for v_row in
    select *
    from public.event_ga_cart_holds as h
    where h.reserved_until <= clock_timestamp()
      and (p_event_id is null or h.event_id = p_event_id)
    order by h.reserved_until asc
    limit 2500
    for update skip locked
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_row.quantity)
    where id = v_row.tier_id;

    delete from public.event_ga_cart_holds where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  where u.status = 'reserved'
    and u.reserved_order_id is null
    and u.reserved_until is not null
    and u.reserved_until <= clock_timestamp()
    and (p_event_id is null or u.event_id = p_event_id);

  get diagnostics v_seating = row_count;
  v_count := v_count + coalesce(v_seating, 0);

  for v_order_id in
    select distinct u.reserved_order_id
    from public.event_seating_units as u
    where u.status = 'reserved'
      and u.reserved_order_id is not null
      and u.reserved_until is not null
      and u.reserved_until <= clock_timestamp()
      and (p_event_id is null or u.event_id = p_event_id)
  loop
    perform public.expire_seating_order(v_order_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.purge_expired_checkout_holds(uuid) from public;
grant execute on function public.purge_expired_checkout_holds(uuid)
  to anon, authenticated, service_role;

comment on function public.purge_expired_checkout_holds(uuid) is
  'Libera GA cart holds y asientos reserved_until <= now(). Lectura de stock no depende del Cron.';

create or replace function public.get_event_tier_live_stock(p_event_id uuid)
returns table (
  tier_id uuid,
  capacity integer,
  sold integer,
  available integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.purge_expired_checkout_holds(p_event_id);

  return query
  select
    tt.id,
    coalesce(tt.total_capacity, tt.capacity)::integer,
    greatest(
      0,
      tt.sold - coalesce(expired.qty, 0)
    )::integer,
    greatest(
      0,
      coalesce(tt.total_capacity, tt.capacity)
        - greatest(0, tt.sold - coalesce(expired.qty, 0))
    )::integer
  from public.ticket_tiers as tt
  left join lateral (
    select coalesce(sum(h.quantity), 0)::integer as qty
    from public.event_ga_cart_holds as h
    where h.tier_id = tt.id
      and h.reserved_until <= clock_timestamp()
  ) as expired on true
  where tt.event_id = p_event_id;
end;
$$;

revoke all on function public.get_event_tier_live_stock(uuid) from public;
grant execute on function public.get_event_tier_live_stock(uuid)
  to anon, authenticated, service_role;

-- Occupancy: ignora holds GA expirados aunque skip locked no los haya borrado.
create or replace function public.event_schedule_day_ids(p_event_id uuid)
returns table (day_id text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.id::text
  from public.event_schedules as s
  where s.event_id = p_event_id
  union
  select distinct nullif(btrim(elem ->> 'id'), '')
  from public.events as e
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(e.schedule_days, '[]'::jsonb)) = 'array'
        then coalesce(e.schedule_days, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as elem
  where e.id = p_event_id
    and not exists (
      select 1 from public.event_schedules as s where s.event_id = p_event_id
    )
    and nullif(btrim(elem ->> 'id'), '') is not null
    and not public.ticket_day_is_full_pass(elem ->> 'id');
$$;

create or replace function public.event_occupied_day_units(
  p_event_id uuid,
  p_day_id text
)
returns integer
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select greatest(
    0,
    coalesce(sum(tt.sold), 0)::integer
      - coalesce((
          select sum(h.quantity)::integer
          from public.event_ga_cart_holds as h
          join public.ticket_tiers as ht on ht.id = h.tier_id
          where ht.event_id = p_event_id
            and h.reserved_until <= clock_timestamp()
            and ht.tier_type is distinct from 'addon'
            and ht.tier_type is distinct from 'bundle'
            and (
              public.ticket_day_is_full_pass(ht.day_id)
              or (
                not public.ticket_day_is_full_pass(p_day_id)
                and ht.day_id::text is not distinct from p_day_id
              )
            )
        ), 0)
  )::integer
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.tier_type is distinct from 'addon'
    and tt.tier_type is distinct from 'bundle'
    and (
      public.ticket_day_is_full_pass(tt.day_id)
      or (
        not public.ticket_day_is_full_pass(p_day_id)
        and tt.day_id::text is not distinct from p_day_id
      )
    );
$$;

create or replace function public.event_occupied_venue_units(p_event_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_peak integer := 0;
  v_day text;
  v_has_day boolean := false;
begin
  for v_day in
    select d.day_id from public.event_schedule_day_ids(p_event_id) as d
  loop
    v_has_day := true;
    v_peak := greatest(v_peak, public.event_occupied_day_units(p_event_id, v_day));
  end loop;

  if v_has_day then
    return v_peak;
  end if;

  return (
    select greatest(
      0,
      coalesce(sum(tt.sold), 0)::integer
        - coalesce((
            select sum(h.quantity)::integer
            from public.event_ga_cart_holds as h
            where h.event_id = p_event_id
              and h.reserved_until <= clock_timestamp()
          ), 0)
    )::integer
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id
      and tt.tier_type is distinct from 'addon'
      and tt.tier_type is distinct from 'bundle'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) RPCs de disponibilidad: purge + status efectivo
-- -----------------------------------------------------------------------------
create or replace function public.get_event_seating_sector_summary(p_event_id uuid)
returns table (
  sector_id text,
  sector_name text,
  color text,
  layout_type text,
  capacity_per_unit integer,
  tier_id uuid,
  available integer,
  reserved integer,
  sold integer,
  blocked integer,
  total integer
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if not public.seating_catalog_is_readable(p_event_id) then
    return;
  end if;

  perform public.purge_expired_checkout_holds(p_event_id);

  return query
  select
    u.sector_id,
    min(u.sector_name) as sector_name,
    min(u.color) as color,
    min(u.layout_type) as layout_type,
    min(u.capacity_per_unit)::integer as capacity_per_unit,
    (min(u.tier_id::text))::uuid as tier_id,
    count(*) filter (
      where public.seating_unit_live_status(u.status, u.reserved_until) = 'available'
    )::integer as available,
    count(*) filter (
      where public.seating_unit_live_status(u.status, u.reserved_until) = 'reserved'
    )::integer as reserved,
    count(*) filter (
      where public.seating_unit_live_status(u.status, u.reserved_until) = 'sold'
    )::integer as sold,
    count(*) filter (
      where public.seating_unit_live_status(u.status, u.reserved_until) = 'blocked'
    )::integer as blocked,
    count(*)::integer as total
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and tt.visibility = 'public'
  group by u.sector_id
  order by min(u.sector_name);
end;
$$;

revoke all on function public.get_event_seating_sector_summary(uuid) from public;
grant execute on function public.get_event_seating_sector_summary(uuid)
  to anon, authenticated, service_role;

create or replace function public.get_event_seating_units_by_sector(
  p_event_id uuid,
  p_sector_id text
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
  reserved_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if p_sector_id is null or btrim(p_sector_id) = '' then
    return;
  end if;

  if not public.seating_catalog_is_readable(p_event_id) then
    return;
  end if;

  perform public.purge_expired_checkout_holds(p_event_id);

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
    end
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and tt.visibility = 'public'
  order by
    u.row_number nulls last,
    u.row_label nulls last,
    u.label;
end;
$$;

revoke all on function public.get_event_seating_units_by_sector(uuid, text) from public;
grant execute on function public.get_event_seating_units_by_sector(uuid, text)
  to anon, authenticated, service_role;

create or replace function public.get_event_seating_unit(
  p_event_id uuid,
  p_unit_id uuid
)
returns table (
  id uuid,
  tier_id uuid,
  sector_id text,
  sector_name text,
  layout_item_id text,
  label text,
  status text,
  reserved_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if not public.seating_catalog_is_readable(p_event_id) then
    return;
  end if;

  perform public.purge_expired_checkout_holds(p_event_id);

  return query
  select
    u.id,
    u.tier_id,
    u.sector_id,
    u.sector_name,
    u.layout_item_id,
    u.label,
    public.seating_unit_live_status(u.status, u.reserved_until),
    case
      when public.seating_unit_live_status(u.status, u.reserved_until) = 'reserved'
        then u.reserved_until
      else null
    end
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.id = p_unit_id
    and u.event_id = p_event_id
    and tt.visibility = 'public';
end;
$$;

revoke all on function public.get_event_seating_unit(uuid, uuid) from public;
grant execute on function public.get_event_seating_unit(uuid, uuid)
  to anon, authenticated, service_role;

create or replace function public.get_event_seating_availability(p_event_id uuid)
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
set search_path = pg_catalog, extensions, public
as $$
declare
  v_allowed boolean := false;
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

  perform public.purge_expired_checkout_holds(p_event_id);

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
    end
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

-- -----------------------------------------------------------------------------
-- 6) Reserve path: purge bajo lock del evento, day_id uuid-safe
-- -----------------------------------------------------------------------------
create or replace function public.assert_cascade_stock_available(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_phase_id uuid default null
)
returns table (
  venue_id uuid,
  phase_id uuid,
  unit_price numeric,
  venue_remaining integer,
  tier_remaining integer,
  phase_remaining integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.events%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_venue public.venues%rowtype;
  v_phase public.ticket_tier_phases%rowtype;
  v_now timestamptz := clock_timestamp();
  v_tier_cap integer;
  v_phase_left integer;
  v_venue_left integer;
  v_venue_cap integer;
  v_additional integer := greatest(0, coalesce(p_quantity, 0));
  v_day text;
  v_used integer;
  v_has_day boolean := false;
  v_expired integer := 0;
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'La cantidad debe ser mayor o igual a cero'
      using errcode = '22023';
  end if;

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'Evento no encontrado'
      using errcode = 'P0002';
  end if;

  perform public.purge_expired_checkout_holds(p_event_id);

  select *
    into v_tier
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found or v_tier.event_id is distinct from p_event_id then
    raise exception 'Ticket tier no encontrado'
      using errcode = 'P0002';
  end if;

  select coalesce(sum(h.quantity), 0)::integer
    into v_expired
  from public.event_ga_cart_holds as h
  where h.tier_id = p_tier_id
    and h.reserved_until <= clock_timestamp();

  if v_event.venue_id is not null and v_tier.tier_type is distinct from 'addon' then
    select *
      into v_venue
    from public.venues as v
    where v.id = v_event.venue_id
    for update of v;

    if not found then
      raise exception 'Lugar del evento no encontrado'
        using errcode = 'P0002';
    end if;

    v_venue_cap := coalesce(v_venue.max_capacity, v_venue.capacity);
    v_venue_left := greatest(0, v_venue_cap);

    if public.ticket_day_is_full_pass(v_tier.day_id) then
      for v_day in
        select d.day_id from public.event_schedule_day_ids(p_event_id) as d
      loop
        v_has_day := true;
        v_used := public.event_occupied_day_units(p_event_id, v_day);
        v_venue_left := least(v_venue_left, greatest(0, v_venue_cap - v_used));
        if v_additional > greatest(0, v_venue_cap - v_used) then
          raise exception 'Capacidad física del recinto insuficiente'
            using errcode = 'P0001';
        end if;
      end loop;

      if not v_has_day then
        v_used := public.event_occupied_venue_units(p_event_id);
        v_venue_left := greatest(0, v_venue_cap - v_used);
        if v_additional > v_venue_left then
          raise exception 'Capacidad física del recinto insuficiente'
            using errcode = 'P0001';
        end if;
      end if;
    else
      v_used := public.event_occupied_day_units(p_event_id, v_tier.day_id::text);
      v_venue_left := greatest(0, v_venue_cap - v_used);
      if v_additional > v_venue_left then
        raise exception 'Capacidad física del recinto insuficiente'
          using errcode = 'P0001';
      end if;
    end if;
  else
    v_venue_left := null;
  end if;

  v_tier_cap := coalesce(v_tier.total_capacity, v_tier.capacity);
  if (v_tier_cap - v_tier.sold + v_expired) < v_additional then
    raise exception 'Capacidad del ticket insuficiente'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.ticket_tier_phases as p where p.tier_id = p_tier_id
  ) then
    if p_phase_id is not null then
      select *
        into v_phase
      from public.ticket_tier_phases as p
      where p.id = p_phase_id
        and p.tier_id = p_tier_id
      for update of p;

      if not found then
        raise exception 'Fase de venta no encontrada'
          using errcode = 'P0002';
      end if;
    else
      select *
        into v_phase
      from public.ticket_tier_phases as p
      where p.id = (
        select inner_p.id
        from public.ticket_tier_phases as inner_p
        where inner_p.tier_id = p_tier_id
          and inner_p.status = 'active'
        order by inner_p.start_time nulls last
        limit 1
      )
      for update of p;

      if not found then
        select *
          into v_phase
        from public.ticket_tier_phases as p
        where p.id = (
          select inner_p.id
          from public.ticket_tier_phases as inner_p
          where inner_p.tier_id = p_tier_id
            and inner_p.status = 'scheduled'
            and (inner_p.start_time is null or inner_p.start_time <= v_now)
            and (inner_p.end_time is null or inner_p.end_time > v_now)
          order by inner_p.start_time nulls last
          limit 1
        )
        for update of p;
      end if;

      if not found then
        raise exception 'No hay una fase de venta activa para este ticket'
          using errcode = 'P0002';
      end if;
    end if;

    if v_phase.status = 'sold_out' then
      raise exception 'La fase de venta está agotada'
        using errcode = 'P0001';
    end if;

    if v_phase.start_time is not null and v_phase.start_time > v_now then
      raise exception 'La fase de venta todavía no comenzó'
        using errcode = 'P0001';
    end if;

    if v_phase.end_time is not null and v_phase.end_time <= v_now then
      raise exception 'La fase de venta ya cerró'
        using errcode = 'P0001';
    end if;

    if v_phase.capacity_limit is not null then
      v_phase_left := v_phase.capacity_limit - v_phase.sold;
      if v_additional > v_phase_left then
        raise exception 'Capacidad de la fase de venta insuficiente'
          using errcode = 'P0001';
      end if;
    else
      v_phase_left := v_tier_cap - v_tier.sold + v_expired;
    end if;
  else
    v_phase_left := v_tier_cap - v_tier.sold + v_expired;
  end if;

  venue_id := v_event.venue_id;
  phase_id := v_phase.id;
  unit_price := coalesce(v_phase.price, v_tier.price);
  venue_remaining := v_venue_left;
  tier_remaining := v_tier_cap - v_tier.sold + v_expired;
  phase_remaining := v_phase_left;
  return next;
end;
$$;

comment on function public.get_event_seating_sector_summary(uuid) is
  'Disponibilidad por sector; libera holds expirados al leer.';
comment on function public.get_event_seating_units_by_sector(uuid, text) is
  'Inventario de un sector; self-heal de reserved_until <= now().';
comment on function public.get_event_tier_live_stock(uuid) is
  'Stock GA en vivo: purge + ignora event_ga_cart_holds expirados.';

-- Simulacion local (sin Cron):
--   insert event_ga_cart_holds con reserved_until < now() e inflar ticket_tiers.sold;
--   select * from get_event_tier_live_stock(event_id);
--   available debe incluir esas unidades de inmediato.
