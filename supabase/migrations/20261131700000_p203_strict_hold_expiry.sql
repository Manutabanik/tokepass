-- P203 · Expiración estricta de holds (15 min) y liberación de asientos numerados.
-- El cron Vercel /api/cron/expire-orders corre cada minuto.
-- sold se recalcula al expirar órdenes / GA holds. Mesa 05 vuelve a available
-- en la misma TX (units + occupancy replica + seat_holds).

-- -----------------------------------------------------------------------------
-- TTL: pending_payment ya no congela el asiento más allá de expires_at.
-- -----------------------------------------------------------------------------
comment on column public.seat_holds.status is
  'active = carrito. pending_payment = checkout MP. Ambos mueren en expires_at (15m).';

comment on column public.orders.payment_started_at is
  'Se setea al crear la preferencia. El cron expira a los 15m desde este instante.';

create index if not exists orders_pending_payment_started_idx
  on public.orders (payment_started_at)
  where status = 'pending' and payment_started_at is not null;

create or replace function public.seat_hold_is_live(p_hold public.seat_holds)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select p_hold.expires_at > clock_timestamp();
$$;

-- -----------------------------------------------------------------------------
-- Occupancy pública: reserved_until para que el mapa libere al vencer el timer
-- sin esperar al cron (selectable: true en cuanto reserved_until pasa).
-- -----------------------------------------------------------------------------
alter table public.event_seating_occupancy
  add column if not exists reserved_until timestamptz;

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
    event_date_id,
    reserved_until
  )
  values (
    new.id,
    new.event_id,
    new.status,
    new.sector_id,
    new.layout_item_id,
    new.event_date_id,
    new.reserved_until
  )
  on conflict (id) do update
    set event_id = excluded.event_id,
        status = excluded.status,
        seating_sector_id = excluded.seating_sector_id,
        layout_item_id = excluded.layout_item_id,
        event_date_id = excluded.event_date_id,
        reserved_until = excluded.reserved_until;

  return new;
end;
$$;

drop trigger if exists event_seating_units_occupancy_sync
  on public.event_seating_units;
create trigger event_seating_units_occupancy_sync
after insert or update of
    event_id, status, sector_id, layout_item_id, event_date_id, reserved_until
  or delete
on public.event_seating_units
for each row
execute function public.sync_event_seating_occupancy();

update public.event_seating_occupancy as occ
set reserved_until = u.reserved_until
from public.event_seating_units as u
where occ.id = u.id
  and occ.reserved_until is distinct from u.reserved_until;

create or replace view public.event_seating_occupancy_view
  with (security_invoker = true)
as
select
  id,
  event_id,
  status,
  seating_sector_id,
  layout_item_id,
  event_date_id,
  reserved_until
from public.event_seating_occupancy;

grant select on public.event_seating_occupancy_view to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Freeze de pago: +15m desde el click, no +24h. sold no puede quedar 24h inflado.
-- -----------------------------------------------------------------------------
create or replace function public.freeze_seat_holds_for_payment(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_until timestamptz := clock_timestamp() + interval '15 minutes';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return 0;
  end if;

  update public.orders
  set
    payment_started_at = coalesce(payment_started_at, clock_timestamp()),
    updated_at = now()
  where id = p_order_id
    and status = 'pending';

  if not found then
    return 0;
  end if;

  update public.event_seating_units as u
  set
    reserved_until = v_until,
    updated_at = now()
  where u.reserved_order_id = p_order_id
    and u.status = 'reserved';

  update public.seat_holds as h
  set
    status = 'pending_payment',
    frozen_at = coalesce(h.frozen_at, clock_timestamp()),
    order_id = p_order_id,
    expires_at = v_until
  from public.tickets as t
  where t.order_id = p_order_id
    and (
      h.seating_unit_id = t.seating_unit_id
      or (
        h.owner_id = t.owner_id
        and h.event_id = t.event_id
        and h.status = 'active'
      )
    );

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- Una unidad reservada vencida vuelve a available (con o sin orden).
-- -----------------------------------------------------------------------------
create or replace function public.expire_seating_cart_hold(p_unit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
begin
  if p_unit_id is null then
    return false;
  end if;

  delete from public.seat_holds
  where seating_unit_id = p_unit_id
    and expires_at <= clock_timestamp();

  select u.reserved_order_id
    into v_order_id
  from public.event_seating_units as u
  where u.id = p_unit_id
    and u.status = 'reserved'
    and u.reserved_until <= clock_timestamp();

  if v_order_id is not null then
    perform public.expire_seating_order(v_order_id);
  end if;

  update public.event_seating_units
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = clock_timestamp()
  where id = p_unit_id
    and status = 'reserved'
    and reserved_until <= clock_timestamp()
    and (
      reserved_order_id is null
      or not exists (
        select 1
        from public.orders as o
        where o.id = reserved_order_id
          and o.status = 'pending'
      )
    );

  return found;
end;
$$;

create or replace function public.expire_seating_cart_holds(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_extra integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
  v_order_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with expired as (
    select u.id
    from public.event_seating_units as u
    where u.status = 'reserved'
      and u.reserved_order_id is null
      and u.reserved_until <= clock_timestamp()
    order by u.reserved_until asc
    limit v_batch
    for update skip locked
  ),
  dropped as (
    delete from public.seat_holds as h
    using expired
    where h.seating_unit_id = expired.id
    returning h.id
  )
  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = clock_timestamp()
  from expired
  where u.id = expired.id;

  get diagnostics v_count = row_count;

  for v_order_id in
    select distinct u.reserved_order_id
    from public.event_seating_units as u
    join public.orders as o on o.id = u.reserved_order_id
    where u.status = 'reserved'
      and u.reserved_order_id is not null
      and u.reserved_until <= clock_timestamp()
      and o.status = 'pending'
    order by u.reserved_order_id
    limit v_batch
  loop
    if public.expire_seating_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  with leftover as (
    select u.id
    from public.event_seating_units as u
    where u.status = 'reserved'
      and u.reserved_until <= clock_timestamp()
      and (
        u.reserved_order_id is null
        or not exists (
          select 1
          from public.orders as o
          where o.id = u.reserved_order_id
            and o.status = 'pending'
        )
      )
    order by u.reserved_until asc
    limit v_batch
    for update skip locked
  ),
  dropped as (
    delete from public.seat_holds as h
    using leftover
    where h.seating_unit_id = leftover.id
    returning h.id
  )
  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = clock_timestamp()
  from leftover
  where u.id = leftover.id;

  get diagnostics v_extra = row_count;
  return v_count + coalesce(v_extra, 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- expire_seating_order: sold--, tickets cancelled, units available, holds out.
-- -----------------------------------------------------------------------------
create or replace function public.expire_seating_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
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
      and u.reserved_until <= clock_timestamp()
  ) then
    return false;
  end if;

  for v_tier_id, v_count in
    select s.tier_id, s.unit_count
    from public.count_pending_order_sold_units(p_order_id) as s
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
    when undefined_function then
      null;
  end;

  begin
    perform public.release_order_promo_code(p_order_id);
  exception
    when undefined_function then
      null;
  end;

  update public.orders
  set
    status = 'expired',
    updated_at = now()
  where id = p_order_id
    and status = 'pending';

  update public.event_seating_units
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = clock_timestamp()
  where reserved_order_id = p_order_id
    and status = 'reserved';

  perform public.release_payment_frozen_holds(p_order_id);

  return true;
end;
$$;

create or replace function public.expire_abandoned_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
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

  if not found then
    return false;
  end if;

  if v_order.status is distinct from 'pending' then
    return false;
  end if;

  for v_tier_id, v_count in
    select s.tier_id, s.unit_count
    from public.count_pending_order_sold_units(p_order_id) as s
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
    when undefined_function then
      null;
  end;

  begin
    perform public.release_order_promo_code(p_order_id);
  exception
    when undefined_function then
      null;
  end;

  update public.orders
  set
    status = 'expired',
    updated_at = now()
  where id = p_order_id
    and status = 'pending';

  update public.event_seating_units
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = clock_timestamp()
  where reserved_order_id = p_order_id
    and status = 'reserved';

  perform public.release_payment_frozen_holds(p_order_id);

  return true;
end;
$$;

-- Carrito sin pagar: 15m desde created_at.
-- Click de pago: 15m desde payment_started_at (el reconcile corre antes).
create or replace function public.expire_abandoned_orders(
  p_older_than interval default interval '15 minutes',
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
  v_cutoff timestamptz := clock_timestamp() - p_older_than;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_order_id in
    select o.id
    from public.orders as o
    where o.status = 'pending'
      and (
        (
          o.payment_started_at is null
          and o.created_at < v_cutoff
        )
        or (
          o.payment_started_at is not null
          and o.payment_started_at < v_cutoff
        )
      )
    order by o.created_at asc
    limit v_batch
    for update skip locked
  loop
    if public.expire_abandoned_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_abandoned_orders(interval, integer) is
  'Libera pending a los 15m (created_at o payment_started_at). Batch + SKIP LOCKED. Recalcula sold.';

create or replace function public.expire_seating_orders(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_order_id in
    select o.id
    from public.orders as o
    where o.status = 'pending'
      and exists (
        select 1
        from public.event_seating_units as u
        where u.reserved_order_id = o.id
          and u.status = 'reserved'
          and u.reserved_until <= clock_timestamp()
      )
    order by o.created_at asc
    limit v_batch
    for update of o skip locked
  loop
    if public.expire_seating_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_seating_orders(integer) is
  'Expira pending cuyo reserved_until venció, haya o no empezado el pago. Units → available.';

create or replace function public.expire_seat_holds(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
  v_hold public.seat_holds%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_hold in
    select *
    from public.seat_holds as h
    where h.expires_at <= clock_timestamp()
    order by h.expires_at asc
    limit v_batch
    for update skip locked
  loop
    delete from public.seat_holds where id = v_hold.id;
    if v_hold.seating_unit_id is not null then
      perform public.expire_seating_cart_hold(v_hold.seating_unit_id);
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_seat_holds(integer) is
  'Borra seat_holds vencidos (active y pending_payment) y libera la unidad.';

-- Catch-all: GA holds + units huérfanas + órdenes de seating vencidas + seat_holds.
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
  v_holds integer := 0;
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

  delete from public.seat_holds as h
  where h.expires_at <= clock_timestamp()
    and (p_event_id is null or h.event_id = p_event_id);

  get diagnostics v_holds = row_count;
  v_count := v_count + coalesce(v_holds, 0);

  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = clock_timestamp()
  where u.status = 'reserved'
    and u.reserved_until is not null
    and u.reserved_until <= clock_timestamp()
    and (p_event_id is null or u.event_id = p_event_id)
    and (
      u.reserved_order_id is null
      or not exists (
        select 1
        from public.orders as o
        where o.id = u.reserved_order_id
          and o.status = 'pending'
      )
    );

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

  perform public.heal_ticket_tier_phases(p_event_id);

  return v_count;
end;
$$;
