-- =============================================================================
-- P13 - Interactive Venue Mapping & Hybrid Seating Engine
-- Static venue layouts stay lightweight JSONB. Runtime availability is
-- normalized per event/tier to guarantee row-level atomic reservations.
-- =============================================================================

alter table public.venues
  add column if not exists seating_layout jsonb not null default '[]'::jsonb,
  add column if not exists seating_background_url text;

alter table public.ticket_tiers
  add column if not exists layout_type text not null default 'general',
  add column if not exists seating_sector_id text,
  add column if not exists capacity_per_unit integer not null default 1;

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_layout_type_check;
alter table public.ticket_tiers
  add constraint ticket_tiers_layout_type_check
  check (layout_type in ('general', 'table_combo', 'numbered_seat'));

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_capacity_per_unit_check;
alter table public.ticket_tiers
  add constraint ticket_tiers_capacity_per_unit_check
  check (capacity_per_unit between 1 and 100);

alter table public.tickets
  add column if not exists seating_unit_id uuid,
  add column if not exists max_admissions integer not null default 1,
  add column if not exists admissions_used integer not null default 0;

alter table public.tickets
  drop constraint if exists tickets_admissions_check;
alter table public.tickets
  add constraint tickets_admissions_check
  check (
    max_admissions between 1 and 100
    and admissions_used between 0 and max_admissions
  );

create table if not exists public.event_seating_units (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  sector_id text not null,
  sector_name text not null,
  layout_item_id text not null,
  label text not null,
  color text not null default '#10B981',
  layout_type text not null,
  capacity_per_unit integer not null default 1,
  status text not null default 'available',
  reserved_by uuid,
  reserved_order_id uuid references public.orders(id) on delete set null,
  reserved_until timestamptz,
  sold_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, tier_id, layout_item_id),
  constraint event_seating_units_layout_type_check
    check (layout_type in ('table_combo', 'numbered_seat')),
  constraint event_seating_units_status_check
    check (status in ('available', 'reserved', 'sold', 'blocked')),
  constraint event_seating_units_capacity_check
    check (capacity_per_unit between 1 and 100),
  constraint event_seating_units_hold_shape_check
    check (
      (status = 'reserved'
        and reserved_by is not null
        and reserved_order_id is not null
        and reserved_until is not null)
      or
      (status <> 'reserved')
    )
);

alter table public.tickets
  drop constraint if exists tickets_seating_unit_id_fkey;
alter table public.tickets
  add constraint tickets_seating_unit_id_fkey
  foreign key (seating_unit_id)
  references public.event_seating_units(id)
  on delete set null;

create index if not exists event_seating_units_event_status_idx
  on public.event_seating_units(event_id, status);
create index if not exists event_seating_units_tier_status_idx
  on public.event_seating_units(tier_id, status);
create index if not exists event_seating_units_expiry_idx
  on public.event_seating_units(reserved_until)
  where status = 'reserved';
create index if not exists tickets_seating_unit_idx
  on public.tickets(seating_unit_id)
  where seating_unit_id is not null;

comment on column public.venues.seating_layout is
  'Plano estático ligero. Array de sectores con items numerados; el estado de venta vive en event_seating_units.';
comment on column public.ticket_tiers.layout_type is
  'general, table_combo o numbered_seat.';
comment on column public.ticket_tiers.seating_sector_id is
  'Identificador del sector dentro de venues.seating_layout.';
comment on column public.tickets.max_admissions is
  'Cantidad máxima de accesos admitidos por el QR maestro.';

-- -----------------------------------------------------------------------------
-- Organizer RLS. Public buyers only read the safe availability RPC.
-- -----------------------------------------------------------------------------
alter table public.event_seating_units enable row level security;

drop policy if exists event_seating_units_organizer_select
  on public.event_seating_units;
create policy event_seating_units_organizer_select
on public.event_seating_units
for select
to authenticated
using (
  exists (
    select 1
    from public.events as e
    where e.id = event_seating_units.event_id
      and e.organizer_id = auth.uid()
  )
  or (select public.is_super_admin())
);

drop policy if exists event_seating_units_organizer_write
  on public.event_seating_units;
create policy event_seating_units_organizer_write
on public.event_seating_units
for all
to authenticated
using (
  exists (
    select 1
    from public.events as e
    where e.id = event_seating_units.event_id
      and e.organizer_id = auth.uid()
  )
  or (select public.is_super_admin())
)
with check (
  exists (
    select 1
    from public.events as e
    where e.id = event_seating_units.event_id
      and e.organizer_id = auth.uid()
  )
  or (select public.is_super_admin())
);

revoke all on table public.event_seating_units from anon;
grant select, insert, update, delete
  on table public.event_seating_units to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Materialize a tier's static venue sector into event-scoped lockable rows.
-- Triggered inside create/update_complete_event_tx, preserving atomicity.
-- -----------------------------------------------------------------------------
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
  v_item jsonb;
  v_item_status text;
  v_capacity integer;
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
    raise exception 'SEATING_LAYOUT_NOT_FOUND'
      using errcode = '23514';
  end if;

  if jsonb_typeof(v_layout) = 'object' then
    v_layout := jsonb_build_array(v_layout);
  end if;

  if jsonb_typeof(v_layout) <> 'array' then
    raise exception 'SEATING_LAYOUT_INVALID'
      using errcode = '23514';
  end if;

  select value
    into v_sector
  from jsonb_array_elements(v_layout)
  where value ->> 'id' = new.seating_sector_id
  limit 1;

  if v_sector is null then
    raise exception 'SEATING_SECTOR_NOT_FOUND'
      using errcode = '23514';
  end if;

  if coalesce(v_sector ->> 'layout_type', '') <> new.layout_type then
    raise exception 'SEATING_LAYOUT_TYPE_MISMATCH'
      using errcode = '23514';
  end if;

  if jsonb_typeof(v_sector -> 'items') <> 'array'
     or jsonb_array_length(v_sector -> 'items') = 0 then
    raise exception 'SEATING_SECTOR_EMPTY'
      using errcode = '23514';
  end if;

  v_capacity := greatest(
    1,
    least(
      100,
      coalesce(
        nullif(v_sector ->> 'capacity_per_unit', '')::integer,
        new.capacity_per_unit,
        1
      )
    )
  );

  for v_item in
    select value from jsonb_array_elements(v_sector -> 'items')
  loop
    if nullif(btrim(coalesce(v_item ->> 'id', '')), '') is null
       or nullif(btrim(coalesce(v_item ->> 'label', '')), '') is null then
      continue;
    end if;

    v_item_status := case
      when coalesce(v_item ->> 'status', 'available') = 'blocked'
        then 'blocked'
      else 'available'
    end;

    insert into public.event_seating_units (
      event_id,
      venue_id,
      tier_id,
      sector_id,
      sector_name,
      layout_item_id,
      label,
      color,
      layout_type,
      capacity_per_unit,
      status
    )
    values (
      new.event_id,
      v_venue_id,
      new.id,
      new.seating_sector_id,
      coalesce(nullif(btrim(v_sector ->> 'sector_name'), ''), new.name),
      v_item ->> 'id',
      v_item ->> 'label',
      coalesce(nullif(v_sector ->> 'color', ''), '#10B981'),
      new.layout_type,
      v_capacity,
      v_item_status
    )
    on conflict (event_id, tier_id, layout_item_id)
    do update set
      sector_id = excluded.sector_id,
      sector_name = excluded.sector_name,
      label = excluded.label,
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

  delete from public.event_seating_units as u
  where u.tier_id = new.id
    and u.status in ('available', 'blocked')
    and not exists (
      select 1
      from jsonb_array_elements(v_sector -> 'items') as item
      where item ->> 'id' = u.layout_item_id
    );

  return new;
end;
$$;

drop trigger if exists sync_event_seating_units_from_tier
  on public.ticket_tiers;
create trigger sync_event_seating_units_from_tier
after insert or update of
  layout_type,
  seating_sector_id,
  capacity_per_unit,
  event_id
on public.ticket_tiers
for each row
execute function public.sync_event_seating_units_from_tier();

create or replace function public.configure_event_seating_tiers(
  p_event_id uuid,
  p_configs jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config jsonb;
  v_tier_id uuid;
  v_updated integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and not exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and (
        e.organizer_id = auth.uid()
        or public.is_super_admin()
      )
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_configs is null or jsonb_typeof(p_configs) <> 'array' then
    raise exception 'p_configs debe ser un array'
      using errcode = '22023';
  end if;

  for v_config in
    select value from jsonb_array_elements(p_configs)
  loop
    v_tier_id := null;
    begin
      v_tier_id := nullif(v_config ->> 'id', '')::uuid;
    exception when others then
      v_tier_id := null;
    end;

    if v_tier_id is not null then
      update public.ticket_tiers
      set
        layout_type = case
          when v_config ->> 'layout_type' in (
            'general', 'table_combo', 'numbered_seat'
          ) then v_config ->> 'layout_type'
          else 'general'
        end,
        seating_sector_id = nullif(
          btrim(coalesce(v_config ->> 'seating_sector_id', '')),
          ''
        ),
        capacity_per_unit = greatest(
          1,
          least(
            100,
            coalesce(
              nullif(v_config ->> 'capacity_per_unit', '')::integer,
              1
            )
          )
        ),
        updated_at = now()
      where id = v_tier_id
        and event_id = p_event_id;
    else
      update public.ticket_tiers
      set
        layout_type = case
          when v_config ->> 'layout_type' in (
            'general', 'table_combo', 'numbered_seat'
          ) then v_config ->> 'layout_type'
          else 'general'
        end,
        seating_sector_id = nullif(
          btrim(coalesce(v_config ->> 'seating_sector_id', '')),
          ''
        ),
        capacity_per_unit = greatest(
          1,
          least(
            100,
            coalesce(
              nullif(v_config ->> 'capacity_per_unit', '')::integer,
              1
            )
          )
        ),
        updated_at = now()
      where event_id = p_event_id
        and name = v_config ->> 'name';
    end if;

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'SEATING_TIER_CONFIG_AMBIGUOUS: %',
        coalesce(v_config ->> 'name', v_config ->> 'id', '?')
        using errcode = '23514';
    end if;
  end loop;
end;
$$;

revoke all on function public.configure_event_seating_tiers(uuid, jsonb)
  from public, anon;
grant execute on function public.configure_event_seating_tiers(uuid, jsonb)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Keep runtime unit status synchronized with pending/valid/cancelled tickets.
-- -----------------------------------------------------------------------------
create or replace function public.sync_seating_unit_from_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.seating_unit_id is not null
       and old.status = 'pending_payment'::public.ticket_status then
      update public.event_seating_units
      set
        status = 'available',
        reserved_by = null,
        reserved_order_id = null,
        reserved_until = null,
        updated_at = now()
      where id = old.seating_unit_id
        and status = 'reserved'
        and reserved_order_id is not distinct from old.order_id;
    end if;
    return old;
  end if;

  if new.seating_unit_id is null then
    return new;
  end if;

  if old.status = 'pending_payment'::public.ticket_status
     and new.status = 'valid'::public.ticket_status then
    update public.event_seating_units
    set
      status = 'sold',
      sold_order_id = new.order_id,
      reserved_by = null,
      reserved_order_id = null,
      reserved_until = null,
      updated_at = now()
    where id = new.seating_unit_id
      and status = 'reserved'
      and reserved_order_id = new.order_id;
  elsif old.status = 'pending_payment'::public.ticket_status
        and new.status <> 'pending_payment'::public.ticket_status then
    update public.event_seating_units
    set
      status = 'available',
      reserved_by = null,
      reserved_order_id = null,
      reserved_until = null,
      updated_at = now()
    where id = new.seating_unit_id
      and status = 'reserved'
      and reserved_order_id is not distinct from new.order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_seating_unit_from_ticket_update
  on public.tickets;
create trigger sync_seating_unit_from_ticket_update
after update of status on public.tickets
for each row
execute function public.sync_seating_unit_from_ticket();

drop trigger if exists sync_seating_unit_from_ticket_delete
  on public.tickets;
create trigger sync_seating_unit_from_ticket_delete
after delete on public.tickets
for each row
execute function public.sync_seating_unit_from_ticket();

-- -----------------------------------------------------------------------------
-- Expire one 8-minute seating order atomically and restore tier stock.
-- -----------------------------------------------------------------------------
create or replace function public.expire_seating_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_tier_id uuid;
  v_count integer;
begin
  if p_order_id is null then
    return false;
  end if;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found or v_order.status is distinct from 'pending' then
    return false;
  end if;

  if not exists (
    select 1
    from public.event_seating_units as u
    where u.reserved_order_id = p_order_id
      and u.status = 'reserved'
      and u.reserved_until <= now()
  ) then
    return false;
  end if;

  for v_tier_id, v_count in
    select t.tier_id, count(*)::integer
    from public.tickets as t
    where t.order_id = p_order_id
      and t.status = 'pending_payment'::public.ticket_status
    group by t.tier_id
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_count)
    where id = v_tier_id;
  end loop;

  update public.tickets
  set
    status = 'cancelled'::public.ticket_status,
    updated_at = now()
  where order_id = p_order_id
    and status = 'pending_payment'::public.ticket_status;

  begin
    perform public.release_order_event_items(p_order_id);
  exception
    when undefined_function then null;
  end;

  update public.orders
  set status = 'expired', updated_at = now()
  where id = p_order_id and status = 'pending';

  return true;
end;
$$;

revoke all on function public.expire_seating_order(uuid) from public;
revoke all on function public.expire_seating_order(uuid)
  from anon, authenticated;
grant execute on function public.expire_seating_order(uuid) to service_role;

create or replace function public.expire_seating_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_order_id in
    select distinct u.reserved_order_id
    from public.event_seating_units as u
    where u.status = 'reserved'
      and u.reserved_until <= now()
      and u.reserved_order_id is not null
    limit 500
  loop
    if public.expire_seating_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_seating_orders() from public;
revoke all on function public.expire_seating_orders()
  from anon, authenticated;
grant execute on function public.expire_seating_orders() to service_role;

-- -----------------------------------------------------------------------------
-- Safe public availability. Expired holds are released lazily on read.
-- -----------------------------------------------------------------------------
create or replace function public.get_event_seating_availability(p_event_id uuid)
returns table (
  id uuid,
  tier_id uuid,
  sector_id text,
  sector_name text,
  layout_item_id text,
  label text,
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
    select 1
    from public.events as e
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
    u.color,
    u.layout_type,
    u.capacity_per_unit,
    u.status,
    case when u.status = 'reserved' then u.reserved_until else null end
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and tt.visibility = 'public'
  order by u.sector_name, u.label;
end;
$$;

revoke all on function public.get_event_seating_availability(uuid) from public;
grant execute on function public.get_event_seating_availability(uuid)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Atomic single-unit reservation. One master ticket represents one unit.
-- -----------------------------------------------------------------------------
create or replace function public.reserve_seating_unit_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_tier_id uuid,
  p_seating_unit_id uuid,
  p_promoter_id uuid default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  seating_unit_id uuid,
  reserved_until timestamptz,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_organizer_id uuid;
  v_max_per_user integer := 4;
  v_owned_held integer := 0;
  v_order_id uuid := gen_random_uuid();
  v_ticket_id uuid;
  v_secret text;
  v_hold_until timestamptz := now() + interval '8 minutes';
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select e.organizer_id, coalesce(e.max_tickets_per_user, 4)
    into v_organizer_id, v_max_per_user
  from public.events as e
  where e.id = p_event_id
    and e.status = 'published'::public.event_status
  for update of e;

  if v_organizer_id is null then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select *
    into v_tier
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found
     or v_tier.event_id is distinct from p_event_id
     or v_tier.layout_type = 'general' then
    raise exception 'Tier de ubicación inválido'
      using errcode = '23514';
  end if;

  select *
    into v_unit
  from public.event_seating_units as u
  where u.id = p_seating_unit_id
    and u.event_id = p_event_id
    and u.tier_id = p_tier_id;

  if not found then
    raise exception 'Ubicación no encontrada'
      using errcode = 'P0002';
  end if;

  if v_unit.status = 'reserved'
     and v_unit.reserved_until <= now()
     and v_unit.reserved_order_id is not null then
    perform public.expire_seating_order(v_unit.reserved_order_id);
  end if;

  select * into v_unit
  from public.event_seating_units
  where id = p_seating_unit_id
    and event_id = p_event_id
    and tier_id = p_tier_id
  for update;

  if v_unit.status <> 'available' then
    raise exception 'SEATING_UNIT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if v_tier.sold >= v_tier.capacity then
    raise exception 'Sold out' using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_owned_held
  from public.tickets as t
  where t.event_id = p_event_id
    and t.owner_id = p_owner_id
    and t.status in (
      'valid'::public.ticket_status,
      'pending_payment'::public.ticket_status
    );

  if v_owned_held + 1 > v_max_per_user then
    raise exception 'MAX_TICKETS_PER_USER_EXCEEDED'
      using errcode = 'P0001';
  end if;

  if p_promoter_id is not null and not exists (
    select 1 from public.promoters as pr
    where pr.id = p_promoter_id
      and pr.organizer_id = v_organizer_id
  ) then
    raise exception 'Promoter inválido para este evento'
      using errcode = '23514';
  end if;

  insert into public.orders (
    id,
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    promoter_id
  )
  values (
    v_order_id,
    p_owner_id,
    round(v_tier.price, 2),
    round(coalesce(v_tier.platform_fee, 0), 2),
    round(v_tier.price, 2),
    'pending',
    p_promoter_id
  );

  update public.event_seating_units
  set
    status = 'reserved',
    reserved_by = p_owner_id,
    reserved_order_id = v_order_id,
    reserved_until = v_hold_until,
    updated_at = now()
  where id = p_seating_unit_id
    and status = 'available';

  if not found then
    raise exception 'SEATING_UNIT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  update public.ticket_tiers
  set sold = sold + 1
  where id = p_tier_id;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.tickets (
    event_id,
    tier_id,
    owner_id,
    qr_code,
    totp_secret,
    status,
    order_id,
    seating_unit_id,
    max_admissions,
    admissions_used
  )
  values (
    p_event_id,
    p_tier_id,
    p_owner_id,
    gen_random_uuid()::text,
    v_secret,
    'pending_payment'::public.ticket_status,
    v_order_id,
    p_seating_unit_id,
    v_unit.capacity_per_unit,
    0
  )
  returning id into v_ticket_id;

  return query select
    v_order_id,
    v_ticket_id,
    p_seating_unit_id,
    v_hold_until,
    round(v_tier.price, 2),
    round(coalesce(v_tier.platform_fee, 0), 2),
    round(v_tier.price, 2);
end;
$$;

revoke all on function public.reserve_seating_unit_tx(
  uuid, uuid, uuid, uuid, uuid
) from public;
revoke all on function public.reserve_seating_unit_tx(
  uuid, uuid, uuid, uuid, uuid
) from anon;
grant execute on function public.reserve_seating_unit_tx(
  uuid, uuid, uuid, uuid, uuid
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Atomic master-QR admission: one scan admits one person until capacity.
-- -----------------------------------------------------------------------------
create or replace function public.scan_ticket_admission(
  p_ticket_id uuid,
  p_validated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_next integer;
begin
  if auth.uid() is null
     or auth.uid() is distinct from p_validated_by then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not public.user_is_event_organizer_or_staff(
    p_validated_by,
    v_ticket.event_id,
    array['door_staff'::public.event_staff_role]
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_ticket.status <> 'valid'::public.ticket_status then
    return jsonb_build_object(
      'ok', false,
      'code', case
        when v_ticket.status in (
          'used'::public.ticket_status,
          'scanned'::public.ticket_status
        ) then 'already_used'
        else 'invalid_status'
      end,
      'admissions_used', v_ticket.admissions_used,
      'max_admissions', v_ticket.max_admissions
    );
  end if;

  if not public.is_ticket_admission_eligible(v_ticket.id) then
    return jsonb_build_object('ok', false, 'code', 'unpaid');
  end if;

  v_next := v_ticket.admissions_used + 1;

  update public.tickets
  set
    admissions_used = v_next,
    status = case
      when v_next >= greatest(1, v_ticket.max_admissions)
        then 'used'::public.ticket_status
      else 'valid'::public.ticket_status
    end,
    scanned_at = case
      when v_next >= greatest(1, v_ticket.max_admissions)
        then now()
      else scanned_at
    end,
    validated_at = now(),
    validated_by = p_validated_by,
    updated_at = now()
  where id = v_ticket.id;

  return jsonb_build_object(
    'ok', true,
    'code', case
      when v_next >= greatest(1, v_ticket.max_admissions)
        then 'complete'
      else 'partial'
    end,
    'admissions_used', v_next,
    'max_admissions', greatest(1, v_ticket.max_admissions),
    'remaining', greatest(0, v_ticket.max_admissions - v_next)
  );
end;
$$;

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Webhook finalize repair: an expired seating hold can never be revived.
-- -----------------------------------------------------------------------------
create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_mp_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_pending_tickets integer := 0;
  v_valid_tickets integer := 0;
  v_activated integer := 0;
  v_updated integer := 0;
  v_tier_id uuid;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null or nullif(btrim(p_mp_payment_id), '') is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  select count(*)::integer into v_pending_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'pending_payment'::public.ticket_status;

  select count(*)::integer into v_valid_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'valid'::public.ticket_status;

  if v_order.status = 'paid'
     and v_order.mp_payment_id is not distinct from p_mp_payment_id then
    if v_pending_tickets > 0 then
      update public.tickets
      set status = 'valid'::public.ticket_status, updated_at = now()
      where order_id = p_order_id
        and status = 'pending_payment'::public.ticket_status;
    end if;

    begin
      perform public.activate_order_item_redemptions(p_order_id);
    exception when undefined_function then null;
    end;

    return jsonb_build_object(
      'ok', true,
      'code', 'already_paid',
      'idempotent', true
    );
  end if;

  if v_order.status = 'paid'
     and v_order.mp_payment_id is distinct from p_mp_payment_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_paid_other_payment',
      'mp_payment_id', v_order.mp_payment_id
    );
  end if;

  if v_order.status = 'expired' then
    return jsonb_build_object(
      'ok', false,
      'code', 'order_expired',
      'needs_refund', true
    );
  end if;

  if v_order.status is distinct from 'pending' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'status', v_order.status
    );
  end if;

  -- Hard eight-minute gate. A late payment is refunded, never reactivating
  -- a location that may already belong to another buyer.
  if exists (
    select 1
    from public.tickets as t
    join public.event_seating_units as u on u.id = t.seating_unit_id
    where t.order_id = p_order_id
      and (
        u.status <> 'reserved'
        or u.reserved_order_id is distinct from p_order_id
        or u.reserved_until <= now()
      )
  ) then
    for v_tier_id, v_count in
      select t.tier_id, count(*)::integer
      from public.tickets as t
      where t.order_id = p_order_id
        and t.status = 'pending_payment'::public.ticket_status
      group by t.tier_id
    loop
      update public.ticket_tiers
      set sold = greatest(0, sold - v_count)
      where id = v_tier_id;
    end loop;

    update public.tickets
    set status = 'cancelled'::public.ticket_status, updated_at = now()
    where order_id = p_order_id
      and status = 'pending_payment'::public.ticket_status;

    update public.orders
    set status = 'expired', updated_at = now()
    where id = p_order_id and status = 'pending';

    return jsonb_build_object(
      'ok', false,
      'code', 'seating_hold_expired',
      'needs_refund', true
    );
  end if;

  if v_pending_tickets = 0 and v_valid_tickets = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_tickets',
      'needs_refund', true
    );
  end if;

  if v_pending_tickets > 0 then
    update public.tickets
    set status = 'valid'::public.ticket_status, updated_at = now()
    where order_id = p_order_id
      and status = 'pending_payment'::public.ticket_status;

    get diagnostics v_activated = row_count;
    if v_activated is distinct from v_pending_tickets then
      raise exception 'TICKET_ACTIVATION_MISMATCH'
        using errcode = 'P0001';
    end if;
  end if;

  begin
    perform public.activate_order_item_redemptions(p_order_id);
  exception when undefined_function then null;
  end;

  update public.orders
  set
    status = 'paid',
    mp_payment_id = p_mp_payment_id,
    updated_at = now()
  where id = p_order_id and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'ORDER_STATUS_RACE' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'paid',
    'tickets_activated', coalesce(v_activated, 0),
    'idempotent', false
  );
end;
$$;

revoke all on function public.finalize_paid_order(uuid, text) from public;
revoke all on function public.finalize_paid_order(uuid, text)
  from anon, authenticated;
grant execute on function public.finalize_paid_order(uuid, text)
  to service_role;

-- Preserve master-seat identity and partial admission counters on transfers.
create or replace function public.execute_safe_transfer(
  p_ticket_id uuid,
  p_receiver_email text
)
returns table (
  transfer_id uuid,
  new_ticket_id uuid,
  event_title text,
  receiver_email text,
  receiver_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_email text;
  v_receiver_id uuid;
  v_new_ticket_id uuid;
  v_transfer_id uuid;
  v_event_title text;
  v_secret text;
begin
  if v_sender is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_email := lower(btrim(coalesce(p_receiver_email, '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_RECEIVER_EMAIL' using errcode = '22023';
  end if;

  select * into v_ticket
  from public.tickets as t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ticket.owner_id is distinct from v_sender then
    raise exception 'NOT_TICKET_OWNER' using errcode = '42501';
  end if;
  if v_ticket.status::text <> 'valid' then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;
  if v_ticket.transfer_count >= v_ticket.max_transfers_allowed then
    raise exception 'TRANSFER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles as p
    where p.id = v_sender and lower(p.email) = v_email
  ) then
    raise exception 'CANNOT_TRANSFER_TO_SELF' using errcode = '23514';
  end if;

  select p.id into v_receiver_id
  from public.profiles as p
  where lower(p.email) = v_email
  limit 1;

  select e.title into v_event_title
  from public.events as e
  where e.id = v_ticket.event_id;

  update public.tickets
  set
    status = 'transferred'::public.ticket_status,
    seat_id = null,
    seating_unit_id = null,
    updated_at = now()
  where id = v_ticket.id;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.tickets (
    event_id,
    tier_id,
    owner_id,
    qr_code,
    status,
    order_id,
    seat_id,
    seating_unit_id,
    max_admissions,
    admissions_used,
    is_dynamic_qr,
    totp_secret,
    max_transfers_allowed,
    transfer_count
  )
  values (
    v_ticket.event_id,
    v_ticket.tier_id,
    v_receiver_id,
    'xfer_' || replace(gen_random_uuid()::text, '-', ''),
    'valid'::public.ticket_status,
    v_ticket.order_id,
    v_ticket.seat_id,
    v_ticket.seating_unit_id,
    v_ticket.max_admissions,
    v_ticket.admissions_used,
    coalesce(v_ticket.is_dynamic_qr, true),
    v_secret,
    v_ticket.max_transfers_allowed,
    v_ticket.transfer_count + 1
  )
  returning id into v_new_ticket_id;

  insert into public.ticket_transfers (
    sender_id,
    receiver_email,
    original_ticket_id,
    new_ticket_id
  )
  values (
    v_sender,
    v_email,
    v_ticket.id,
    v_new_ticket_id
  )
  returning id into v_transfer_id;

  return query select
    v_transfer_id,
    v_new_ticket_id,
    coalesce(v_event_title, 'Evento Tokepass'),
    v_email,
    v_receiver_id;
end;
$$;

revoke all on function public.execute_safe_transfer(uuid, text) from public;
grant execute on function public.execute_safe_transfer(uuid, text)
  to authenticated;
