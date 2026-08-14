-- =============================================================================
-- P54: Fase 2 eventos masivos
--  1) Resumen por sector + unidades lazy (no dump de 30k filas)
--  2) Gateras para el escáner
--  3) Live dashboard agregado (sin array de tickets)
-- =============================================================================

create or replace function public.seating_catalog_is_readable(p_event_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_status public.event_status;
  v_visibility text;
  v_organizer_id uuid;
begin
  select e.status, e.visibility::text, e.organizer_id
    into v_status, v_visibility, v_organizer_id
  from public.events as e
  where e.id = p_event_id;

  if not found then
    return false;
  end if;

  if v_status in (
       'published'::public.event_status,
       'paused'::public.event_status
     )
     and v_visibility in ('public', 'private') then
    return true;
  end if;

  if v_status in (
    'draft'::public.event_status,
    'paused'::public.event_status
  ) then
    return (
      coalesce(auth.role(), '') = 'service_role'
      or auth.uid() = v_organizer_id
      or public.is_super_admin()
    );
  end if;

  return false;
end;
$$;

revoke all on function public.seating_catalog_is_readable(uuid) from public;
grant execute on function public.seating_catalog_is_readable(uuid)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Totales por sector (carga inicial B2C)
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

  return query
  select
    u.sector_id,
    min(u.sector_name) as sector_name,
    min(u.color) as color,
    min(u.layout_type) as layout_type,
    min(u.capacity_per_unit)::integer as capacity_per_unit,
    min(u.tier_id) as tier_id,
    count(*) filter (where u.status = 'available')::integer as available,
    count(*) filter (where u.status = 'reserved')::integer as reserved,
    count(*) filter (where u.status = 'sold')::integer as sold,
    count(*) filter (where u.status = 'blocked')::integer as blocked,
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

-- -----------------------------------------------------------------------------
-- Unidades de un solo sector (lazy / viewport)
-- -----------------------------------------------------------------------------
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
declare
  v_order_id uuid;
begin
  if p_sector_id is null or btrim(p_sector_id) = '' then
    return;
  end if;

  if not public.seating_catalog_is_readable(p_event_id) then
    return;
  end if;

  for v_order_id in
    select distinct u.reserved_order_id
    from public.event_seating_units as u
    where u.event_id = p_event_id
      and u.sector_id = p_sector_id
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

-- Una unidad (checkout) — no descarga el inventario completo
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
declare
  v_order_id uuid;
begin
  if not public.seating_catalog_is_readable(p_event_id) then
    return;
  end if;

  select u.reserved_order_id
    into v_order_id
  from public.event_seating_units as u
  where u.id = p_unit_id
    and u.event_id = p_event_id
    and u.status = 'reserved'
    and u.reserved_until <= now()
    and u.reserved_order_id is not null;

  if v_order_id is not null then
    perform public.expire_seating_order(v_order_id);
  end if;

  return query
  select
    u.id,
    u.tier_id,
    u.sector_id,
    u.sector_name,
    u.layout_item_id,
    u.label,
    u.status,
    case when u.status = 'reserved' then u.reserved_until else null end
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

-- Gateras del evento (escáner)
create or replace function public.get_event_scanner_gates(p_event_id uuid)
returns table (
  gate_id text,
  label text,
  color text,
  kind text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.user_is_event_organizer_or_staff(
    p_event_id,
    auth.uid(),
    array['door_staff'::public.event_staff_role]
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  select
    'general'::text,
    'Acceso General'::text,
    '#10b981'::text,
    'general'::text
  union all
  select
    s.sector_id,
    coalesce(nullif(s.sector_name, ''), s.sector_id),
    coalesce(nullif(s.color, ''), '#6366f1'),
    'sector'::text
  from (
    select
      u.sector_id,
      min(u.sector_name) as sector_name,
      min(u.color) as color
    from public.event_seating_units as u
    where u.event_id = p_event_id
    group by u.sector_id
  ) as s
  order by kind asc, label;
end;
$$;

revoke all on function public.get_event_scanner_gates(uuid) from public;
grant execute on function public.get_event_scanner_gates(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Live Ops: agregados, sin devolver el array de tickets
-- -----------------------------------------------------------------------------
create or replace function public.get_live_dashboard_stats(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_title text;
  v_date timestamptz;
  v_capacity integer := 0;
  v_sold integer := 0;
  v_checked integer := 0;
  v_result jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.user_is_event_organizer_or_staff(
       p_event_id,
       auth.uid(),
       array['door_staff'::public.event_staff_role]
     ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select e.title, e.date
    into v_title, v_date
  from public.events as e
  where e.id = p_event_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select coalesce(sum(greatest(0, tt.capacity)), 0)::integer
    into v_capacity
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id;

  select count(*)::integer
    into v_sold
  from public.tickets as t
  where t.event_id = p_event_id
    and coalesce(t.is_test, false) = false
    and t.status in (
      'valid'::public.ticket_status,
      'used'::public.ticket_status,
      'scanned'::public.ticket_status
    );

  select count(*)::integer
    into v_checked
  from public.tickets as t
  where t.event_id = p_event_id
    and coalesce(t.is_test, false) = false
    and t.status in (
      'valid'::public.ticket_status,
      'used'::public.ticket_status,
      'scanned'::public.ticket_status
    )
    and (
      t.status in (
        'used'::public.ticket_status,
        'scanned'::public.ticket_status
      )
      or coalesce(t.admissions_used, 0) > 0
      or t.scanned_at is not null
    );

  v_result := jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'event_title', v_title,
    'event_date', v_date,
    'capacity', case when v_capacity > 0 then v_capacity else v_sold end,
    'sold', v_sold,
    'checked_in', v_checked,
    'remaining', greatest(0, v_sold - v_checked),
    'rpm_5', (
      select round(
        count(*)::numeric
          / 5.0,
        2
      )
      from public.tickets as t
      where t.event_id = p_event_id
        and coalesce(t.is_test, false) = false
        and coalesce(t.validated_at, t.scanned_at) >= now() - interval '5 minutes'
        and (
          t.status in (
            'used'::public.ticket_status,
            'scanned'::public.ticket_status
          )
          or coalesce(t.admissions_used, 0) > 0
          or t.scanned_at is not null
        )
    ),
    'rpm_15', (
      select round(count(*)::numeric / 15.0, 2)
      from public.tickets as t
      where t.event_id = p_event_id
        and coalesce(t.is_test, false) = false
        and coalesce(t.validated_at, t.scanned_at) >= now() - interval '15 minutes'
        and (
          t.status in (
            'used'::public.ticket_status,
            'scanned'::public.ticket_status
          )
          or coalesce(t.admissions_used, 0) > 0
          or t.scanned_at is not null
        )
    ),
    'recent_checkin_at', coalesce((
      select jsonb_agg(at_ts order by at_ts)
      from (
        select coalesce(t.validated_at, t.scanned_at, t.updated_at) as at_ts
        from public.tickets as t
        where t.event_id = p_event_id
          and coalesce(t.is_test, false) = false
          and coalesce(t.validated_at, t.scanned_at) >= now() - interval '15 minutes'
          and (
            t.status in (
              'used'::public.ticket_status,
              'scanned'::public.ticket_status
            )
            or coalesce(t.admissions_used, 0) > 0
            or t.scanned_at is not null
          )
      ) as windowed
    ), '[]'::jsonb),
    'hour_buckets', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hour', to_char(bucket_hour, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
          'count', bucket_count
        )
        order by bucket_hour
      )
      from (
        select
          date_trunc('hour', coalesce(t.validated_at, t.scanned_at, t.updated_at)) as bucket_hour,
          count(*)::integer as bucket_count
        from public.tickets as t
        where t.event_id = p_event_id
          and coalesce(t.is_test, false) = false
          and (
            t.status in (
              'used'::public.ticket_status,
              'scanned'::public.ticket_status
            )
            or coalesce(t.admissions_used, 0) > 0
            or t.scanned_at is not null
          )
          and coalesce(t.validated_at, t.scanned_at, t.updated_at)
            >= now() - interval '18 hours'
        group by 1
      ) as hours
    ), '[]'::jsonb),
    'recent_access', coalesce((
      select jsonb_agg(item)
      from (
        select jsonb_build_object(
          'ticket_id', t.id,
          'holder_name', coalesce(nullif(btrim(t.holder_name), ''), 'Titular sin nombre'),
          'tier_name', coalesce(tt.name, 'General'),
          'at', coalesce(t.validated_at, t.scanned_at, t.updated_at)
        ) as item
        from public.tickets as t
        join public.ticket_tiers as tt on tt.id = t.tier_id
        where t.event_id = p_event_id
          and coalesce(t.is_test, false) = false
          and (
            t.status in (
              'used'::public.ticket_status,
              'scanned'::public.ticket_status
            )
            or coalesce(t.admissions_used, 0) > 0
            or t.scanned_at is not null
          )
        order by coalesce(t.validated_at, t.scanned_at, t.updated_at) desc
        limit 20
      ) as recent
    ), '[]'::jsonb),
    'tier_breakdown', coalesce((
      select jsonb_agg(item order by (item ->> 'sold')::int desc)
      from (
        select jsonb_build_object(
          'tier_id', tt.id,
          'name', tt.name,
          'sold', count(t.id) filter (
            where t.status in (
              'valid'::public.ticket_status,
              'used'::public.ticket_status,
              'scanned'::public.ticket_status
            )
          ),
          'checked_in', count(t.id) filter (
            where t.id is not null
              and (
                t.status in (
                  'used'::public.ticket_status,
                  'scanned'::public.ticket_status
                )
                or coalesce(t.admissions_used, 0) > 0
                or t.scanned_at is not null
              )
          )
        ) as item
        from public.ticket_tiers as tt
        left join public.tickets as t
          on t.tier_id = tt.id
         and t.event_id = p_event_id
         and coalesce(t.is_test, false) = false
        where tt.event_id = p_event_id
        group by tt.id, tt.name
        having count(t.id) filter (
          where t.status in (
            'valid'::public.ticket_status,
            'used'::public.ticket_status,
            'scanned'::public.ticket_status
          )
        ) > 0
      ) as tiers
    ), '[]'::jsonb),
    'sector_breakdown', coalesce((
      select jsonb_agg(item order by (item ->> 'sold')::int desc)
      from (
        select jsonb_build_object(
          'sector_key', coalesce(u.sector_id, tt.seating_sector_id, 'general'),
          'sector_name', coalesce(
            nullif(u.sector_name, ''),
            nullif(tt.seating_sector_id, ''),
            'Acceso General'
          ),
          'sold', count(*)::integer,
          'checked_in', count(*) filter (
            where t.status in (
              'used'::public.ticket_status,
              'scanned'::public.ticket_status
            )
            or coalesce(t.admissions_used, 0) > 0
            or t.scanned_at is not null
          )::integer
        ) as item
        from public.tickets as t
        join public.ticket_tiers as tt on tt.id = t.tier_id
        left join public.event_seating_units as u on u.id = t.seating_unit_id
        where t.event_id = p_event_id
          and coalesce(t.is_test, false) = false
          and t.status in (
            'valid'::public.ticket_status,
            'used'::public.ticket_status,
            'scanned'::public.ticket_status
          )
        group by
          coalesce(u.sector_id, tt.seating_sector_id, 'general'),
          coalesce(
            nullif(u.sector_name, ''),
            nullif(tt.seating_sector_id, ''),
            'Acceso General'
          )
      ) as sectors
    ), '[]'::jsonb),
    'tier_names', coalesce((
      select jsonb_object_agg(tt.id::text, tt.name)
      from public.ticket_tiers as tt
      where tt.event_id = p_event_id
    ), '{}'::jsonb)
  );

  return v_result;
end;
$$;

revoke all on function public.get_live_dashboard_stats(uuid) from public;
grant execute on function public.get_live_dashboard_stats(uuid)
  to authenticated, service_role;

comment on function public.get_live_dashboard_stats(uuid) is
  'Agregados Live Ops: aforo, sectores, buckets horarios y últimos 20. No devuelve tickets.';

comment on function public.get_event_seating_sector_summary(uuid) is
  'Metadatos de disponibilidad por sector para el mapa B2C (sin filas de asiento).';
comment on function public.get_event_seating_units_by_sector(uuid, text) is
  'Inventario de un sector; se llama al elegir zona en el checkout.';
