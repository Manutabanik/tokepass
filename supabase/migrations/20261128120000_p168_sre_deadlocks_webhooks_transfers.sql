-- =============================================================================
-- P168 · SRE: lock order, promo FOR UPDATE, one-transfer + 24h barrier
-- =============================================================================

-- Helpers from P94 (CREATE OR REPLACE so this file can apply if P94 never ran).
create or replace function public.checkout_cart_item_tier_id(p_item jsonb)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_raw text;
begin
  v_raw := nullif(btrim(coalesce(
    p_item ->> 'ticket_tier_id',
    p_item ->> 'tier_id',
    p_item ->> 'ticketTierId',
    p_item ->> 'tierId',
    ''
  )), '');
  if v_raw is null then
    return null;
  end if;
  begin
    return v_raw::uuid;
  exception
    when others then
      return null;
  end;
end;
$$;

create or replace function public.checkout_cart_item_seat_id(p_item jsonb)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_raw text;
begin
  v_raw := nullif(btrim(coalesce(
    p_item ->> 'seating_unit_id',
    p_item ->> 'seat_id',
    p_item ->> 'seatId',
    p_item ->> 'seatingUnitId',
    ''
  )), '');
  if v_raw is null then
    return null;
  end if;
  begin
    return v_raw::uuid;
  exception
    when others then
      return null;
  end;
end;
$$;

revoke all on function public.checkout_cart_item_tier_id(jsonb) from public, anon;
grant execute on function public.checkout_cart_item_tier_id(jsonb)
  to authenticated, service_role;

revoke all on function public.checkout_cart_item_seat_id(jsonb) from public, anon;
grant execute on function public.checkout_cart_item_seat_id(jsonb)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Locks: always request multi-row seat/tier locks in UUID order
-- -----------------------------------------------------------------------------
create or replace function public.sorted_cart_seat_ids(p_items jsonb)
returns uuid[]
language sql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select array_agg(seat_id order by seat_id)
      from (
        select distinct public.checkout_cart_item_seat_id(elem.value) as seat_id
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as elem(value)
      ) as seats
      where seat_id is not null
    ),
    '{}'::uuid[]
  );
$$;

create or replace function public.hold_mixed_cart_for_checkout(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb
)
returns table (reserved_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_type text;
  v_tier_id uuid;
  v_qty integer;
  v_seat_id uuid;
  v_keep_seats uuid[] := '{}';
  v_ga_items jsonb := '[]'::jsonb;
  v_until timestamptz := public.checkout_hold_until();
  v_min timestamptz := v_until;
  v_tier public.ticket_tiers%rowtype;
  v_map_backed boolean;
  v_item_numbered boolean;
  v_flag text;
  v_ga_until timestamptz;
  v_held boolean := false;
begin
  perform set_config('lock_timeout', '4s', true);

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform 1 from public.events as e where e.id = p_event_id for update of e;

  if not public.event_is_buyable(p_event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_tier_id := public.checkout_cart_item_tier_id(v_item);
    v_seat_id := public.checkout_cart_item_seat_id(v_item);
    v_type := lower(nullif(btrim(coalesce(v_item ->> 'type', '')), ''));
    v_qty := greatest(0, coalesce((v_item ->> 'quantity')::integer, 0));
    v_flag := lower(nullif(btrim(coalesce(
      v_item ->> 'is_numbered',
      v_item ->> 'isNumbered',
      ''
    )), ''));
    v_item_numbered :=
      case
        when v_flag = 'true' then true
        when v_flag = 'false' then false
        else null
      end;

    if v_tier_id is null then
      continue;
    end if;

    select *
      into v_tier
      from public.ticket_tiers as tt
     where tt.id = v_tier_id
       and tt.event_id = p_event_id;

    if not found then
      raise exception 'Ticket tier no encontrado'
        using errcode = 'P0002';
    end if;

    v_map_backed :=
      case
        when v_item_numbered is false then false
        when v_item_numbered is true then true
        else coalesce(v_tier.layout_type, '') in ('numbered_seat', 'table_combo')
      end;

    if v_type = 'mapped' or v_seat_id is not null then
      if v_seat_id is null then
        raise exception 'SEAT_SELECTION_REQUIRED'
          using errcode = 'P0001';
      end if;
      v_keep_seats := array_append(v_keep_seats, v_seat_id);
    elsif v_map_backed then
      raise exception 'SEAT_SELECTION_REQUIRED'
        using errcode = 'P0001';
    else
      if v_qty < 1 then
        continue;
      end if;
      v_ga_items := v_ga_items || jsonb_build_array(
        jsonb_build_object(
          'type', 'general',
          'ticket_tier_id', v_tier_id,
          'tier_id', v_tier_id,
          'quantity', v_qty
        )
      );
    end if;
  end loop;

  if coalesce(array_length(v_keep_seats, 1), 0) > 0 then
    select coalesce(array_agg(distinct seat_id order by seat_id), '{}'::uuid[])
      into v_keep_seats
      from unnest(v_keep_seats) as seat_id;

    update public.event_seating_units
       set status = 'available',
           reserved_by = null,
           reserved_order_id = null,
           reserved_until = null,
           updated_at = now()
     where event_id = p_event_id
       and reserved_by = p_owner_id
       and status = 'reserved'
       and reserved_order_id is null
       and not (id = any (v_keep_seats));

    foreach v_seat_id in array v_keep_seats
    loop
      perform public.hold_seating_unit_for_cart(
        p_event_id,
        p_owner_id,
        v_seat_id
      );
    end loop;

    v_held := true;
  end if;

  if jsonb_array_length(v_ga_items) > 0 then
    begin
      select h.reserved_until
        into v_ga_until
        from public.hold_ga_tickets_for_cart(
          p_event_id,
          p_owner_id,
          v_ga_items
        ) as h;
      if v_ga_until is not null and v_ga_until < v_min then
        v_min := v_ga_until;
      end if;
      v_held := true;
    exception
      when others then
        if sqlerrm ilike '%SEAT_%' or sqlerrm ilike '%SECTOR_%' then
          raise;
        end if;
        raise exception 'GENERAL_STOCK_UNAVAILABLE'
          using errcode = 'P0001';
    end;
  end if;

  if not v_held then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  reserved_until := v_min;
  return next;
end;
$$;

create or replace function public.assert_seat_holds_for_purchase(
  p_event_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_seat uuid;
  v_unit public.event_seating_units%rowtype;
  v_hold public.seat_holds%rowtype;
  v_session text := nullif(btrim(coalesce(p_session_id, p_owner_id::text, '')), '');
  v_seats uuid[] := public.sorted_cart_seat_ids(p_items);
begin
  if coalesce(array_length(v_seats, 1), 0) = 0 then
    return;
  end if;

  foreach v_seat in array v_seats
  loop
    begin
      select * into v_unit
      from public.event_seating_units
      where id = v_seat
        and event_id = p_event_id
      for update;
    exception
      when lock_not_available then
        raise exception 'SEAT_HOLD_EXPIRED'
          using errcode = 'P0001',
            message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
    end;

    if not found then
      raise exception 'SEAT_HOLD_EXPIRED'
        using errcode = 'P0001',
          message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
    end if;

    if public.seat_is_sold(v_unit)
       and v_unit.reserved_order_id is null then
      raise exception 'SEAT_HOLD_EXPIRED'
        using errcode = 'P0001',
          message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
    end if;

    select *
      into v_hold
    from public.seat_holds as h
    where h.seating_unit_id = v_seat
      and h.event_id = p_event_id
    for update;

    if found then
      if v_hold.expires_at <= clock_timestamp()
         or (
           v_hold.user_session_id is distinct from v_session
           and v_hold.owner_id is distinct from p_owner_id
         ) then
        raise exception 'SEAT_HOLD_EXPIRED'
          using errcode = 'P0001',
            message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
      end if;
    elsif not public.seating_unit_is_owner_cart_hold(
      v_unit.status,
      v_unit.reserved_by,
      v_unit.reserved_until,
      v_unit.reserved_order_id,
      p_owner_id
    ) and v_unit.status <> 'available' then
      raise exception 'SEAT_HOLD_EXPIRED'
        using errcode = 'P0001',
          message = 'Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo.';
    end if;
  end loop;
end;
$$;

create or replace function public.consume_seat_holds_for_purchase(
  p_event_id uuid,
  p_owner_id uuid,
  p_session_id text,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_seat uuid;
  v_count integer := 0;
  v_session text := nullif(btrim(coalesce(p_session_id, p_owner_id::text, '')), '');
  v_seats uuid[] := public.sorted_cart_seat_ids(p_items);
begin
  if coalesce(array_length(v_seats, 1), 0) = 0 then
    return 0;
  end if;

  foreach v_seat in array v_seats
  loop
    delete from public.seat_holds
    where seating_unit_id = v_seat
      and event_id = p_event_id
      and (
        user_session_id = v_session
        or owner_id is not distinct from p_owner_id
      );

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
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

  perform u.id
  from public.event_seating_units as u
  where u.reserved_order_id = p_order_id
    and u.status = 'reserved'
  order by u.id
  for update of u;

  update public.event_seating_units as u
  set
    reserved_until = clock_timestamp() + interval '24 hours',
    updated_at = now()
  where u.reserved_order_id = p_order_id
    and u.status = 'reserved';

  perform h.id
  from public.seat_holds as h
  join public.tickets as t
    on t.order_id = p_order_id
   and (
     h.seating_unit_id = t.seating_unit_id
     or (
       h.owner_id = t.owner_id
       and h.event_id = t.event_id
       and h.status = 'active'
     )
   )
  order by h.id
  for update of h;

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

-- -----------------------------------------------------------------------------
-- Coupons: pessimistic lock + rollback if max_uses is exhausted at pay time
-- -----------------------------------------------------------------------------
create or replace function public.orders_consume_promo_on_paid()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_promo public.promo_codes%rowtype;
begin
  if new.status = 'paid'::public.order_status
     and old.status is distinct from 'paid'::public.order_status
     and new.promo_code_id is not null
     and not coalesce(old.promo_usage_applied, false) then
    select *
      into v_promo
    from public.promo_codes as pc
    where pc.id = new.promo_code_id
    for update of pc;

    if not found then
      raise exception 'PROMO_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    if v_promo.max_uses is not null
       and v_promo.current_uses >= v_promo.max_uses then
      raise exception 'PROMO_MAX_USES'
        using errcode = 'P0001',
          message = 'PROMO_MAX_USES: Este cupón agotó sus usos.';
    end if;

    update public.promo_codes
    set
      current_uses = current_uses + 1,
      updated_at = clock_timestamp()
    where id = v_promo.id;

    new.promo_usage_applied := true;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Transfers: one hop + 24h-before-jornada barrier
-- -----------------------------------------------------------------------------
create or replace function public.ticket_event_starts_at(p_ticket public.tickets)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_start timestamptz;
begin
  if p_ticket.seating_unit_id is not null then
    select s.start_time
      into v_start
    from public.event_seating_units as u
    join public.event_schedules as s on s.id = u.event_date_id
    where u.id = p_ticket.seating_unit_id;
    if v_start is not null then
      return v_start;
    end if;
  end if;

  if p_ticket.tier_id is not null then
    select s.start_time
      into v_start
    from public.ticket_tiers as tt
    join public.event_schedules as s on s.id = tt.day_id
    where tt.id = p_ticket.tier_id;
    if v_start is not null then
      return v_start;
    end if;
  end if;

  select e.date
    into v_start
  from public.events as e
  where e.id = p_ticket.event_id;

  return v_start;
end;
$$;

create or replace function public.assert_ticket_transfer_policy(p_ticket public.tickets)
returns void
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_start timestamptz;
begin
  if coalesce(p_ticket.transfer_count, 0) >= 1
     or coalesce(p_ticket.max_transfers_allowed, 1) < 1
     or coalesce(p_ticket.transfer_count, 0)
        >= coalesce(p_ticket.max_transfers_allowed, 1) then
    raise exception 'TRANSFER_LIMIT_REACHED'
      using errcode = 'P0001';
  end if;

  v_start := public.ticket_event_starts_at(p_ticket);
  if v_start is not null
     and clock_timestamp() > v_start - interval '24 hours' then
    raise exception 'TRANSFER_WINDOW_CLOSED'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.ticket_transfers_enforce_anti_resale()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if new.original_ticket_id is null then
    return new;
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = new.original_ticket_id
  for update of t;

  if found then
    perform public.assert_ticket_transfer_policy(v_ticket);
  end if;

  return new;
end;
$$;

drop trigger if exists ticket_transfers_enforce_anti_resale on public.ticket_transfers;
create trigger ticket_transfers_enforce_anti_resale
before insert on public.ticket_transfers
for each row
execute function public.ticket_transfers_enforce_anti_resale();
