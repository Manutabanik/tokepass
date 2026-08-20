-- P121 · Lecturas publicas de stock sin self-heal (C-INV-1)
-- purge_expired_checkout_holds queda para el cron y assert_cascade_stock_available.
-- seating_unit_live_status y sold - holds vencidos siguen siendo SELECT.

create or replace function public.get_event_tier_live_stock(p_event_id uuid)
returns table (
  tier_id uuid,
  capacity integer,
  sold integer,
  available integer,
  venue_remaining integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_venue_id uuid;
  v_venue_cap integer := null;
begin
  select e.venue_id
    into v_venue_id
  from public.events as e
  where e.id = p_event_id;

  if v_venue_id is not null then
    select coalesce(v.max_capacity, v.capacity)
      into v_venue_cap
    from public.venues as v
    where v.id = v_venue_id;
  end if;

  return query
  with sku as (
    select
      tt.id,
      tt.day_id,
      tt.tier_type,
      coalesce(tt.total_capacity, tt.capacity)::integer as capacity,
      greatest(
        0,
        tt.sold - coalesce(expired.qty, 0)
      )::integer as sold
    from public.ticket_tiers as tt
    left join lateral (
      select coalesce(sum(h.quantity), 0)::integer as qty
      from public.event_ga_cart_holds as h
      where h.tier_id = tt.id
        and h.reserved_until <= clock_timestamp()
    ) as expired on true
    where tt.event_id = p_event_id
  )
  select
    sku.id,
    sku.capacity,
    sku.sold,
    greatest(
      0,
      least(
        sku.capacity - sku.sold,
        case
          when v_venue_cap is null then sku.capacity - sku.sold
          when sku.tier_type = 'addon' then sku.capacity - sku.sold
          when public.ticket_day_is_full_pass(sku.day_id) then
            coalesce(
              (
                select min(
                  greatest(
                    0,
                    v_venue_cap
                      - public.event_occupied_day_units(p_event_id, d.day_id)
                  )
                )
                from public.event_schedule_day_ids(p_event_id) as d
              ),
              greatest(
                0,
                v_venue_cap - public.event_occupied_venue_units(p_event_id)
              )
            )
          else
            greatest(
              0,
              v_venue_cap
                - public.event_occupied_day_units(
                    p_event_id,
                    sku.day_id::text
                  )
            )
        end
      )
    )::integer as available,
    case
      when v_venue_cap is null then null
      when sku.tier_type = 'addon' then null
      when public.ticket_day_is_full_pass(sku.day_id) then
        coalesce(
          (
            select min(
              greatest(
                0,
                v_venue_cap
                  - public.event_occupied_day_units(p_event_id, d.day_id)
              )
            )
            from public.event_schedule_day_ids(p_event_id) as d
          ),
          greatest(
            0,
            v_venue_cap - public.event_occupied_venue_units(p_event_id)
          )
        )
      else
        greatest(
          0,
          v_venue_cap
            - public.event_occupied_day_units(p_event_id, sku.day_id::text)
        )
    end::integer as venue_remaining
  from sku;
end;
$$;

revoke all on function public.get_event_tier_live_stock(uuid) from public;
grant execute on function public.get_event_tier_live_stock(uuid)
  to anon, authenticated, service_role;

comment on function public.get_event_tier_live_stock(uuid) is
  'Stock en vivo (lectura pura). Holds vencidos se restan en SELECT. Purge solo via cron/reserve.';

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
