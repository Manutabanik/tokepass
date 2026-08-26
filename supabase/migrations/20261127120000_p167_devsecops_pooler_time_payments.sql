-- P167: pooler-ready holds, UTC server clock, orphan-payment freeze, atomic promo uses.

-- -----------------------------------------------------------------------------
-- Holds: estado pending_payment + freeze
-- -----------------------------------------------------------------------------
alter table public.seat_holds
  add column if not exists status text not null default 'active';

alter table public.seat_holds
  add column if not exists frozen_at timestamptz;

alter table public.seat_holds
  add column if not exists order_id uuid references public.orders(id) on delete set null;

alter table public.seat_holds
  drop constraint if exists seat_holds_status_check;

alter table public.seat_holds
  add constraint seat_holds_status_check
  check (status in ('active', 'pending_payment'));

create index if not exists seat_holds_pending_payment_idx
  on public.seat_holds (status, frozen_at)
  where status = 'pending_payment';

alter table public.orders
  add column if not exists payment_started_at timestamptz;

create index if not exists orders_pending_unfrozen_idx
  on public.orders (created_at)
  where status = 'pending' and payment_started_at is null;

comment on column public.seat_holds.status is
  'active = TTL 15m. pending_payment = timer congelado hasta webhook rejected/cancelled.';

comment on column public.orders.payment_started_at is
  'Se setea al crear la preferencia. El cron no expira estas órdenes.';

create or replace function public.seat_hold_is_live(p_hold public.seat_holds)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    p_hold.status = 'pending_payment'
    or p_hold.expires_at > clock_timestamp();
$$;

create or replace function public.upsert_seat_hold_for_unit(
  p_unit_id uuid,
  p_session_id text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_layout text;
  v_session text := nullif(btrim(coalesce(p_session_id, '')), '');
  v_hold_id uuid;
  v_owner uuid;
begin
  if p_unit_id is null or v_session is null or p_expires_at is null then
    return null;
  end if;

  select * into v_unit
  from public.event_seating_units
  where id = p_unit_id;

  if not found then
    return null;
  end if;

  v_layout := nullif(btrim(coalesce(v_unit.layout_item_id, '')), '');
  if v_layout is null then
    v_layout := v_unit.id::text;
  end if;

  begin
    v_owner := v_session::uuid;
  exception
    when invalid_text_representation then
      v_owner := auth.uid();
  end;

  insert into public.seat_holds (
    event_id,
    event_date_id,
    event_date_key,
    layout_item_id,
    seating_unit_id,
    user_session_id,
    owner_id,
    expires_at,
    status
  )
  values (
    v_unit.event_id,
    v_unit.event_date_id,
    public.seat_hold_date_key(v_unit.event_date_id),
    v_layout,
    v_unit.id,
    v_session,
    v_owner,
    p_expires_at,
    'active'
  )
  on conflict on constraint seat_holds_event_date_layout_key
  do update set
    seating_unit_id = excluded.seating_unit_id,
    user_session_id = excluded.user_session_id,
    owner_id = excluded.owner_id,
    expires_at = excluded.expires_at,
    status = 'active',
    frozen_at = null,
    order_id = null
  where
    public.seat_holds.status is distinct from 'pending_payment'
    and (
      public.seat_holds.expires_at <= clock_timestamp()
      or public.seat_holds.user_session_id = excluded.user_session_id
    )
  returning id into v_hold_id;

  if v_hold_id is null then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  return v_hold_id;
end;
$$;

create or replace function public.hold_seat(
  p_seat_id text,
  p_event_date_id uuid,
  p_session_id text
)
returns table (
  hold_id uuid,
  seating_unit_id uuid,
  event_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_session text := nullif(btrim(coalesce(p_session_id, '')), '');
  v_owner uuid;
  v_until timestamptz := public.checkout_hold_until();
  v_hold uuid;
  v_other public.seat_holds%rowtype;
begin
  perform set_config('lock_timeout', '4s', true);

  if v_session is null then
    raise exception 'SEAT_HOLD_SESSION_REQUIRED'
      using errcode = '22023';
  end if;

  begin
    v_owner := v_session::uuid;
  exception
    when invalid_text_representation then
      v_owner := auth.uid();
  end;

  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
    v_owner := auth.uid();
    if v_session is distinct from auth.uid()::text then
      v_session := auth.uid()::text;
    end if;
  elsif v_owner is null then
    v_owner := auth.uid();
  end if;

  v_unit := public.resolve_seat_hold_unit(p_seat_id, p_event_date_id);
  if v_unit.id is null then
    raise exception 'Ubicación no encontrada'
      using errcode = 'P0002';
  end if;

  if not public.event_is_buyable(v_unit.event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  delete from public.seat_holds
  where event_id = v_unit.event_id
    and event_date_key = public.seat_hold_date_key(
      coalesce(v_unit.event_date_id, p_event_date_id)
    )
    and layout_item_id = coalesce(
      nullif(btrim(v_unit.layout_item_id), ''),
      v_unit.id::text
    )
    and status is distinct from 'pending_payment'
    and expires_at <= clock_timestamp();

  if v_unit.status = 'reserved'
     and v_unit.reserved_until <= clock_timestamp()
     and v_unit.reserved_order_id is not null then
    perform public.expire_seating_order(v_unit.reserved_order_id);
  elsif v_unit.status = 'reserved'
     and v_unit.reserved_until <= clock_timestamp()
     and v_unit.reserved_order_id is null then
    perform public.expire_seating_cart_hold(v_unit.id);
  end if;

  begin
    select * into v_unit
    from public.event_seating_units
    where id = v_unit.id
    for update;
  exception
    when lock_not_available then
      raise exception 'SEAT_UNAVAILABLE'
        using errcode = 'P0001';
  end;

  if public.seat_is_sold(v_unit) then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  select *
    into v_other
  from public.seat_holds as h
  where h.event_id = v_unit.event_id
    and h.event_date_key = public.seat_hold_date_key(
      coalesce(v_unit.event_date_id, p_event_date_id)
    )
    and h.layout_item_id = coalesce(
      nullif(btrim(v_unit.layout_item_id), ''),
      v_unit.id::text
    )
    and public.seat_hold_is_live(h)
  for update;

  if found
     and v_other.user_session_id is distinct from v_session
     and v_other.owner_id is distinct from v_owner then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if found and v_other.status = 'pending_payment' then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if v_unit.status = 'reserved'
     and not public.seating_unit_is_owner_cart_hold(
       v_unit.status,
       v_unit.reserved_by,
       v_unit.reserved_until,
       v_unit.reserved_order_id,
       v_owner
     ) then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if v_unit.status = 'blocked' then
    raise exception 'SEAT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  perform public.hold_seating_unit_for_cart(
    v_unit.event_id,
    v_owner,
    v_unit.id
  );

  select reserved_until
    into v_until
  from public.event_seating_units
  where id = v_unit.id;

  v_until := coalesce(v_until, public.checkout_hold_until());
  v_hold := public.upsert_seat_hold_for_unit(v_unit.id, v_session, v_until);

  hold_id := v_hold;
  seating_unit_id := v_unit.id;
  event_id := v_unit.event_id;
  expires_at := v_until;
  return next;
end;
$$;

create or replace function public.freeze_seat_holds_for_payment(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
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
    reserved_until = clock_timestamp() + interval '24 hours',
    updated_at = now()
  where u.reserved_order_id = p_order_id
    and u.status = 'reserved';

  update public.seat_holds as h
  set
    status = 'pending_payment',
    frozen_at = coalesce(h.frozen_at, clock_timestamp()),
    order_id = p_order_id
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

revoke all on function public.freeze_seat_holds_for_payment(uuid) from public, anon, authenticated;
grant execute on function public.freeze_seat_holds_for_payment(uuid) to service_role;

create or replace function public.release_payment_frozen_holds(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_hold public.seat_holds%rowtype;
begin
  if p_order_id is null then
    return 0;
  end if;

  for v_hold in
    select h.*
    from public.seat_holds as h
    where h.order_id = p_order_id
       or h.seating_unit_id in (
         select t.seating_unit_id
         from public.tickets as t
         where t.order_id = p_order_id
           and t.seating_unit_id is not null
       )
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

revoke all on function public.release_payment_frozen_holds(uuid) from public, anon, authenticated;
grant execute on function public.release_payment_frozen_holds(uuid) to service_role;

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

  perform public.release_payment_frozen_holds(p_order_id);

  return true;
end;
$$;

create or replace function public.expire_abandoned_orders(
  p_older_than interval default interval '8 minutes',
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
      and o.payment_started_at is null
      and o.created_at < (now() - p_older_than)
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
      and o.payment_started_at is null
      and exists (
        select 1
        from public.event_seating_units as u
        where u.reserved_order_id = o.id
          and u.status = 'reserved'
          and u.reserved_until <= now()
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
    where h.status is distinct from 'pending_payment'
      and h.expires_at <= clock_timestamp()
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

-- -----------------------------------------------------------------------------
-- Cupones: usage_count solo al confirmar el pago (misma transacción).
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists promo_usage_applied boolean not null default false;

create or replace function public.orders_consume_promo_on_paid()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'paid'::public.order_status
     and old.status is distinct from 'paid'::public.order_status
     and new.promo_code_id is not null
     and not coalesce(old.promo_usage_applied, false) then
    update public.promo_codes
    set
      current_uses = current_uses + 1,
      updated_at = clock_timestamp()
    where id = new.promo_code_id;
    new.promo_usage_applied := true;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_consume_promo_on_paid on public.orders;
create trigger orders_consume_promo_on_paid
before update of status on public.orders
for each row
execute function public.orders_consume_promo_on_paid();

create or replace function public.release_order_promo_code(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
begin
  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return;
  end if;

  if v_order.promo_code_id is null or v_order.status = 'paid' then
    return;
  end if;

  update public.orders
  set
    promo_code_id = null,
    discount_amount = 0,
    promo_usage_applied = false,
    updated_at = clock_timestamp()
  where id = p_order_id;
end;
$$;

create or replace function public.apply_promo_code_to_order(
  p_order_id uuid,
  p_owner_id uuid,
  p_promo_code_id uuid
)
returns table (
  ok boolean,
  discount_amount numeric,
  total_amount numeric,
  message text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_promo public.promo_codes%rowtype;
  v_ticket_event uuid;
  v_rate numeric;
  v_implied_net numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2);
  v_new_subtotal numeric(12, 2);
  v_new_service numeric(12, 2);
  v_new_total numeric(12, 2);
  v_pending integer := 0;
begin
  if p_order_id is null or p_owner_id is null or p_promo_code_id is null then
    return query select false, 0::numeric, 0::numeric, 'Datos de cupón incompletos.'::text;
    return;
  end if;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return query select false, 0::numeric, 0::numeric, 'Orden no encontrada.'::text;
    return;
  end if;

  if v_order.buyer_id is distinct from p_owner_id then
    return query select false, 0::numeric, 0::numeric, 'No podés modificar esta orden.'::text;
    return;
  end if;

  if v_order.status is distinct from 'pending' then
    return query select false, 0::numeric, 0::numeric, 'La orden ya no admite cupones.'::text;
    return;
  end if;

  if v_order.promo_code_id is not null then
    return query select false, coalesce(v_order.discount_amount, 0), v_order.total_amount,
      'La orden ya tiene un cupón aplicado.'::text;
    return;
  end if;

  select t.event_id
    into v_ticket_event
  from public.tickets as t
  where t.order_id = p_order_id
  limit 1;

  select *
    into v_promo
  from public.promo_codes as pc
  where pc.id = p_promo_code_id
  for update of pc;

  if not found then
    return query select false, 0::numeric, v_order.total_amount, 'Cupón no encontrado.'::text;
    return;
  end if;

  if v_ticket_event is null or v_promo.event_id is distinct from v_ticket_event then
    return query select false, 0::numeric, v_order.total_amount, 'Cupón inválido para este evento.'::text;
    return;
  end if;

  if not v_promo.is_active then
    return query select false, 0::numeric, v_order.total_amount, 'Este cupón está inactivo.'::text;
    return;
  end if;

  if v_promo.valid_until is not null and v_promo.valid_until < clock_timestamp() then
    return query select false, 0::numeric, v_order.total_amount, 'Este cupón ya venció.'::text;
    return;
  end if;

  select count(*)::integer
    into v_pending
  from public.orders as o
  where o.promo_code_id = v_promo.id
    and o.status = 'pending'
    and o.id is distinct from p_order_id;

  if v_promo.max_uses is not null
     and (v_promo.current_uses + coalesce(v_pending, 0)) >= v_promo.max_uses then
    return query select false, 0::numeric, v_order.total_amount, 'Este cupón agotó sus usos.'::text;
    return;
  end if;

  v_subtotal := round(coalesce(v_order.subtotal, 0), 2)::numeric(12, 2);
  v_discount := public.compute_promo_discount(
    v_promo.discount_type,
    v_promo.discount_value,
    v_subtotal
  );

  if v_discount <= 0 then
    return query select false, 0::numeric, v_order.total_amount, 'El carrito no admite descuento.'::text;
    return;
  end if;

  v_new_subtotal := greatest(0::numeric, v_subtotal - v_discount)::numeric(12, 2);
  v_rate := public.get_event_service_charge_rate(v_ticket_event);
  v_implied_net := greatest(
    0::numeric,
    v_new_subtotal - public.all_in_platform_fee_from_public(v_new_subtotal, v_rate)
  )::numeric(12, 2);
  v_new_service := public.all_in_platform_fee(v_implied_net, v_rate)::numeric(12, 2);
  if v_new_subtotal > 0 then
    v_new_service := least(
      v_new_subtotal,
      v_new_service + public.get_event_platform_fixed_fee(v_ticket_event)
    )::numeric(12, 2);
  end if;
  v_new_total := v_new_subtotal;

  update public.orders
  set
    promo_code_id = v_promo.id,
    discount_amount = v_discount,
    subtotal = v_new_subtotal,
    service_charge = v_new_service,
    total_amount = v_new_total,
    promo_usage_applied = false,
    updated_at = clock_timestamp()
  where id = p_order_id;

  return query select true, v_discount, v_new_total, 'Cupón aplicado.'::text;
end;
$$;
