-- =============================================================================
-- P22: max_tickets_per_user — count only paid admissions
-- Abandoned pending_payment / cancelled / expired must NOT block sandbox retries.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Raise default anti-scalp ceiling (was 4; transfers already coalesced to 10)
-- -----------------------------------------------------------------------------
alter table public.events
  alter column max_tickets_per_user set default 10;

update public.events
set max_tickets_per_user = 10
where max_tickets_per_user < 10;

-- -----------------------------------------------------------------------------
-- 2) Count helper: only tickets that represent a completed purchase / admission
-- -----------------------------------------------------------------------------
create or replace function public.count_user_event_tickets_for_limit(
  p_event_id uuid,
  p_owner_id uuid
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
  select count(*)::integer
  from public.tickets as t
  where t.event_id = p_event_id
    and t.owner_id = p_owner_id
    and t.status in (
      'valid'::public.ticket_status,
      'used'::public.ticket_status,
      'scanned'::public.ticket_status
    );
$$;

comment on function public.count_user_event_tickets_for_limit(uuid, uuid) is
  'Cupo anti-scalp: solo entradas pagadas/activas (valid/used/scanned). Ignora pending_payment y cancelled.';

revoke all on function public.count_user_event_tickets_for_limit(uuid, uuid) from public;
grant execute on function public.count_user_event_tickets_for_limit(uuid, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Release this buyer's stale pending checkouts for the event (retry-friendly)
-- -----------------------------------------------------------------------------
create or replace function public.expire_buyer_pending_event_orders(
  p_owner_id uuid,
  p_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
begin
  if p_owner_id is null or p_event_id is null then
    return 0;
  end if;

  for v_order_id in
    select distinct o.id
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    where o.buyer_id = p_owner_id
      and o.status = 'pending'
      and t.event_id = p_event_id
      and t.status = 'pending_payment'::public.ticket_status
  loop
    update public.event_seating_units
    set
      status = 'available',
      reserved_by = null,
      reserved_order_id = null,
      reserved_until = null,
      updated_at = now()
    where reserved_order_id = v_order_id
      and status = 'reserved';

    if public.expire_abandoned_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_buyer_pending_event_orders(uuid, uuid) is
  'Libera holds pending del comprador en un evento antes de una nueva reserva.';

revoke all on function public.expire_buyer_pending_event_orders(uuid, uuid) from public;
revoke all on function public.expire_buyer_pending_event_orders(uuid, uuid)
  from anon;
grant execute on function public.expire_buyer_pending_event_orders(uuid, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) reserve_tickets_tx — use helper + expire stale holds first
-- -----------------------------------------------------------------------------
create or replace function public.reserve_tickets_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_item jsonb;
  v_tier_id uuid;
  v_quantity integer;
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event_id uuid;
  v_organizer_id uuid;
  v_rate numeric(5, 4);
  v_subtotal numeric(12, 2) := 0;
  v_service_charge numeric(12, 2) := 0;
  v_total_amount numeric(12, 2) := 0;
  v_order_id uuid;
  v_ticket_ids uuid[] := '{}';
  v_i integer;
  v_one_id uuid;
  v_requested integer := 0;
  v_owned_held integer := 0;
  v_max_per_user integer := 10;
  v_secret text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if p_event_id is null or p_owner_id is null then
    raise exception 'event_id y owner_id son obligatorios'
      using errcode = '22023';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Debés indicar al menos un ítem de compra'
      using errcode = '22023';
  end if;

  -- Free seat/stock from previous abandoned checkouts before counting the cupo.
  perform public.expire_buyer_pending_event_orders(p_owner_id, p_event_id);

  select e.organizer_id, coalesce(e.max_tickets_per_user, 10)
    into v_organizer_id, v_max_per_user
  from public.events as e
  where e.id = p_event_id
    and e.status = 'published'::public.event_status
  for update of e;

  if v_organizer_id is null then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select coalesce(sum(coalesce((value ->> 'quantity')::integer, 0)), 0)
    into v_requested
  from jsonb_array_elements(p_items);

  v_owned_held := public.count_user_event_tickets_for_limit(p_event_id, p_owner_id);

  if (v_owned_held + v_requested) > v_max_per_user then
    raise exception 'MAX_TICKETS_PER_USER_EXCEEDED'
      using errcode = 'P0001';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  if p_promoter_id is not null then
    if not exists (
      select 1
      from public.promoters as pr
      where pr.id = p_promoter_id
        and pr.organizer_id = v_organizer_id
    ) then
      raise exception 'Promoter inválido para este evento'
        using errcode = '23514';
    end if;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_tier_id := (v_item ->> 'tier_id')::uuid;
    exception
      when others then
        raise exception 'tier_id inválido' using errcode = '22P02';
    end;

    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_tier_id is null or v_quantity <= 0 then
      raise exception 'Cada ítem requiere tier_id y quantity > 0'
        using errcode = '22023';
    end if;

    select
      tt.event_id,
      tt.price,
      coalesce(
        tt.platform_fee,
        public.all_in_platform_fee(coalesce(tt.base_price, tt.price), v_rate)
      ),
      tt.capacity,
      tt.sold
      into v_tier_event_id, v_price, v_unit_fee, v_capacity, v_sold
    from public.ticket_tiers as tt
    where tt.id = v_tier_id
    for update of tt;

    if not found then
      raise exception 'Ticket tier not found'
        using errcode = 'P0002';
    end if;

    if v_tier_event_id is distinct from p_event_id then
      raise exception 'El tier no pertenece al evento'
        using errcode = '23514';
    end if;

    if (v_capacity - v_sold) < v_quantity then
      raise exception 'Sold out'
        using errcode = 'P0001';
    end if;

    update public.ticket_tiers
    set sold = sold + v_quantity
    where id = v_tier_id;

    v_subtotal := v_subtotal + (v_price * v_quantity);
    v_service_charge := v_service_charge + (v_unit_fee * v_quantity);

    for v_i in 1..v_quantity loop
      v_secret := encode(extensions.gen_random_bytes(24), 'hex');

      insert into public.tickets (
        event_id,
        tier_id,
        owner_id,
        qr_code,
        totp_secret,
        status
      )
      values (
        p_event_id,
        v_tier_id,
        p_owner_id,
        gen_random_uuid()::text,
        v_secret,
        'pending_payment'::public.ticket_status
      )
      returning id into v_one_id;

      v_ticket_ids := array_append(v_ticket_ids, v_one_id);
    end loop;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_service_charge := round(v_service_charge, 2);
  v_total_amount := v_subtotal;

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    promoter_id
  )
  values (
    p_owner_id,
    v_subtotal,
    v_service_charge,
    v_total_amount,
    'pending',
    p_promoter_id
  )
  returning id into v_order_id;

  update public.tickets
  set order_id = v_order_id
  where id = any (v_ticket_ids);

  return query
  select
    v_order_id,
    t.id,
    v_subtotal,
    v_service_charge,
    v_total_amount
  from unnest(v_ticket_ids) as t(id);
end;
$$;

comment on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) is
  'Reserva All-In; cupo por persona solo cuenta valid/used/scanned; libera holds pending previos.';

revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from public;
revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from anon;
grant execute on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5) reserve_seating_unit_tx — same cupo semantics
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
  v_max_per_user integer := 10;
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

  perform public.expire_buyer_pending_event_orders(p_owner_id, p_event_id);

  select e.organizer_id, coalesce(e.max_tickets_per_user, 10)
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

  v_owned_held := public.count_user_event_tickets_for_limit(p_event_id, p_owner_id);

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
