-- P80: Convert GA holds to orders without releasing sold.
-- Per-day venue occupancy (abono + dias). Event All-In fees on reserve_*.
--
-- Bootstrap: 20261108000000 estaba duplicado (artists vs ga_cart_holds).
-- Si esa tabla no se aplico, las funciones %rowtype de este archivo fallan (42P01).

create or replace function public.checkout_hold_until()
returns timestamptz
language sql
stable
set search_path = pg_catalog, public
as $$
  select clock_timestamp() + interval '10 minutes';
$$;

revoke all on function public.checkout_hold_until() from public;
grant execute on function public.checkout_hold_until() to authenticated, service_role;

create table if not exists public.event_ga_cart_holds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  owner_id uuid not null,
  quantity integer not null check (quantity >= 1),
  reserved_until timestamptz not null,
  created_at timestamptz not null default now(),
  constraint event_ga_cart_holds_owner_tier_key unique (event_id, owner_id, tier_id)
);

create index if not exists event_ga_cart_holds_expiry_idx
  on public.event_ga_cart_holds (reserved_until);

create index if not exists event_ga_cart_holds_tier_idx
  on public.event_ga_cart_holds (tier_id, reserved_until);

alter table public.event_ga_cart_holds enable row level security;

revoke all on table public.event_ga_cart_holds from public, anon;
grant select on table public.event_ga_cart_holds to authenticated;
grant all on table public.event_ga_cart_holds to service_role;

drop policy if exists event_ga_cart_holds_select_own on public.event_ga_cart_holds;
create policy event_ga_cart_holds_select_own
  on public.event_ga_cart_holds
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 1) Day / occupancy helpers
-- -----------------------------------------------------------------------------
create or replace function public.ticket_day_is_full_pass(p_day_id text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p_day_id is null
      or btrim(p_day_id) = ''
      or lower(btrim(p_day_id)) = 'all';
$$;

create or replace function public.event_schedule_day_ids(p_event_id uuid)
returns table (day_id text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
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
    and nullif(btrim(elem ->> 'id'), '') is not null
    and not public.ticket_day_is_full_pass(elem ->> 'id');
$$;

create or replace function public.event_occupied_day_units(
  p_event_id uuid,
  p_day_id text
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum(tt.sold), 0)::integer
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.tier_type is distinct from 'addon'
    and tt.tier_type is distinct from 'bundle'
    and (
      public.ticket_day_is_full_pass(tt.day_id)
      or (
        not public.ticket_day_is_full_pass(p_day_id)
        and tt.day_id is not distinct from p_day_id
      )
    );
$$;

create or replace function public.event_occupied_venue_units(p_event_id uuid)
returns integer
language plpgsql
stable
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
    select coalesce(sum(tt.sold), 0)::integer
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id
      and tt.tier_type is distinct from 'addon'
      and tt.tier_type is distinct from 'bundle'
  );
end;
$$;

comment on function public.event_occupied_venue_units(uuid) is
  'Pico de ocupacion fisica. Multi-dia: max(occupied(day)). Excluye addon y padre bundle.';

-- -----------------------------------------------------------------------------
-- 2) All-In fee = events.platform_fee_percentage + platform_fixed_fee
-- -----------------------------------------------------------------------------
create or replace function public.all_in_platform_fee_for_event(
  p_event_id uuid,
  p_public numeric
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when coalesce(p_public, 0) <= 0 then 0::numeric
    else round(
      least(
        coalesce(p_public, 0),
        coalesce(p_public, 0) * public.get_event_service_charge_rate(p_event_id)
          + public.get_event_platform_fixed_fee(p_event_id)
      ),
      2
    )
  end;
$$;

revoke all on function public.all_in_platform_fee_for_event(uuid, numeric) from public;
grant execute on function public.all_in_platform_fee_for_event(uuid, numeric)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) assert_cascade: venue per affected day + additional units only
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

  select *
    into v_tier
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found or v_tier.event_id is distinct from p_event_id then
    raise exception 'Ticket tier no encontrado'
      using errcode = 'P0002';
  end if;

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
      v_used := public.event_occupied_day_units(p_event_id, v_tier.day_id);
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
  if (v_tier_cap - v_tier.sold) < v_additional then
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
      v_phase_left := v_tier_cap - v_tier.sold;
    end if;
  else
    v_phase_left := v_tier_cap - v_tier.sold;
  end if;

  venue_id := v_event.venue_id;
  phase_id := v_phase.id;
  unit_price := coalesce(v_phase.price, v_tier.price);
  venue_remaining := v_venue_left;
  tier_remaining := v_tier_cap - v_tier.sold;
  phase_remaining := v_phase_left;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Consume GA hold without releasing the reserved sold slice
-- -----------------------------------------------------------------------------
create or replace function public.consume_ga_cart_hold_for_reserve(
  p_event_id uuid,
  p_owner_id uuid,
  p_tier_id uuid,
  p_quantity integer
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hold public.event_ga_cart_holds%rowtype;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  select *
    into v_hold
  from public.event_ga_cart_holds as h
  where h.event_id = p_event_id
    and h.owner_id = p_owner_id
    and h.tier_id = p_tier_id
  for update;

  if not found then
    return p_quantity;
  end if;

  if v_hold.reserved_until <= clock_timestamp() then
    update public.ticket_tiers
    set sold = greatest(0, sold - v_hold.quantity)
    where id = p_tier_id;
    delete from public.event_ga_cart_holds where id = v_hold.id;
    return p_quantity;
  end if;

  if v_hold.quantity > p_quantity then
    update public.ticket_tiers
    set sold = greatest(0, sold - (v_hold.quantity - p_quantity))
    where id = p_tier_id;
    delete from public.event_ga_cart_holds where id = v_hold.id;
    return 0;
  end if;

  delete from public.event_ga_cart_holds where id = v_hold.id;
  return greatest(0, p_quantity - v_hold.quantity);
end;
$$;

create or replace function public.apply_ga_stock_for_reserve(
  p_event_id uuid,
  p_owner_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_phase_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_additional integer;
begin
  v_additional := public.consume_ga_cart_hold_for_reserve(
    p_event_id,
    p_owner_id,
    p_tier_id,
    p_quantity
  );

  perform public.assert_cascade_stock_available(
    p_event_id,
    p_tier_id,
    v_additional,
    p_phase_id
  );

  if v_additional > 0 then
    update public.ticket_tiers
    set sold = sold + v_additional
    where id = p_tier_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) claim_and_reserve_ga_cart_tx — single TX, sold never drops
-- -----------------------------------------------------------------------------
create or replace function public.claim_and_reserve_ga_cart_tx(
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
  v_phase_id uuid;
  v_admit integer;
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_tier_event_id uuid;
  v_organizer_id uuid;
  v_subtotal numeric(12, 2) := 0;
  v_service_charge numeric(12, 2) := 0;
  v_total_amount numeric(12, 2) := 0;
  v_order_id uuid;
  v_ticket_ids uuid[] := '{}';
  v_unit integer;
  v_slot integer;
  v_one_id uuid;
  v_group_id uuid;
  v_requested integer := 0;
  v_owned_held integer := 0;
  v_max_per_user integer := 10;
  v_secret text;
  v_sector_key text;
  v_table_number integer;
  v_zone_id uuid;
begin
  perform set_config('lock_timeout', '4s', true);

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

  perform public.expire_buyer_pending_event_orders(p_owner_id, p_event_id);

  if not public.event_is_buyable(p_event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select e.organizer_id, coalesce(e.max_tickets_per_user, 10)
    into v_organizer_id, v_max_per_user
  from public.events as e
  where e.id = p_event_id
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
    0,
    0,
    0,
    'pending',
    p_promoter_id
  )
  returning id into v_order_id;

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
    v_sector_key := nullif(btrim(v_item ->> 'sector_key'), '');
    v_table_number := nullif(v_item ->> 'table_number', '')::integer;
    begin
      v_zone_id := nullif(v_item ->> 'zone_id', '')::uuid;
    exception
      when others then
        v_zone_id := null;
    end;
    begin
      v_phase_id := nullif(v_item ->> 'phase_id', '')::uuid;
    exception
      when others then
        v_phase_id := null;
    end;

    if v_tier_id is null or v_quantity <= 0 then
      raise exception 'Cada ítem requiere tier_id y quantity > 0'
        using errcode = '22023';
    end if;

    select tt.event_id, greatest(1, least(50, coalesce(tt.admit_count, 1)))
      into v_tier_event_id, v_admit
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

    v_price := public.resolve_zone_tier_unit_price(
      p_event_id,
      v_tier_id,
      v_sector_key,
      v_table_number,
      v_zone_id
    );

    if v_price is null then
      raise exception 'Ticket tier not found'
        using errcode = 'P0002';
    end if;

    v_unit_fee := public.all_in_platform_fee_for_event(p_event_id, v_price);

    perform public.apply_ga_stock_for_reserve(
      p_event_id,
      p_owner_id,
      v_tier_id,
      v_quantity,
      v_phase_id
    );

    if v_phase_id is not null then
      update public.ticket_tier_phases
      set status = 'active'
      where id = v_phase_id
        and status is distinct from 'sold_out';
    end if;

    v_subtotal := v_subtotal + (v_price * v_quantity);
    v_service_charge := v_service_charge + (v_unit_fee * v_quantity);

    for v_unit in 1..v_quantity loop
      v_group_id := case when v_admit > 1 then gen_random_uuid() else null end;

      for v_slot in 1..v_admit loop
        v_secret := encode(extensions.gen_random_bytes(24), 'hex');

        insert into public.tickets (
          event_id,
          tier_id,
          owner_id,
          qr_code,
          totp_secret,
          status,
          order_id,
          group_id,
          group_slot,
          max_admissions,
          admissions_used,
          phase_id
        )
        values (
          p_event_id,
          v_tier_id,
          p_owner_id,
          gen_random_uuid()::text,
          v_secret,
          'pending_payment'::public.ticket_status,
          v_order_id,
          v_group_id,
          case when v_admit > 1 then v_slot else null end,
          1,
          0,
          v_phase_id
        )
        returning id into v_one_id;

        v_ticket_ids := array_append(v_ticket_ids, v_one_id);
      end loop;

      perform public.fulfill_tier_combo_items(
        v_order_id,
        v_tier_id,
        p_owner_id,
        'pending'
      );
    end loop;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_service_charge := round(v_service_charge, 2);
  v_total_amount := v_subtotal;

  update public.orders
  set
    subtotal = v_subtotal,
    service_charge = v_service_charge,
    total_amount = v_total_amount,
    updated_at = now()
  where id = v_order_id;

  foreach v_one_id in array v_ticket_ids
  loop
    order_id := v_order_id;
    ticket_id := v_one_id;
    subtotal := v_subtotal;
    service_charge := v_service_charge;
    total_amount := v_total_amount;
    return next;
  end loop;
end;
$$;

comment on function public.claim_and_reserve_ga_cart_tx(uuid, uuid, jsonb, uuid) is
  'Convierte event_ga_cart_holds en orden pending sin decrementar sold.';

revoke all on function public.claim_and_reserve_ga_cart_tx(uuid, uuid, jsonb, uuid)
  from public, anon;
grant execute on function public.claim_and_reserve_ga_cart_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;

-- reserve_tickets_tx now converts holds the same way (no sold gap).
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
begin
  return query
  select *
  from public.claim_and_reserve_ga_cart_tx(
    p_event_id,
    p_owner_id,
    p_items,
    p_promoter_id
  );
end;
$$;

-- Deprecated: must not release sold. Holds are consumed inside reserve.
create or replace function public.claim_ga_cart_holds_for_checkout(
  p_event_id uuid,
  p_owner_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) hold_ga: venue gate on the delta before incrementing sold
-- -----------------------------------------------------------------------------
create or replace function public.hold_ga_tickets_for_cart(
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
  v_tier_id uuid;
  v_qty integer;
  v_prev integer;
  v_delta integer;
  v_tier public.ticket_tiers%rowtype;
  v_until timestamptz := public.checkout_hold_until();
  v_min timestamptz := v_until;
  v_keep uuid[] := '{}';
  v_held boolean := false;
  v_stale public.event_ga_cart_holds%rowtype;
begin
  perform set_config('lock_timeout', '4s', true);

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.event_is_buyable(p_event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  perform 1 from public.events as e where e.id = p_event_id for update of e;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_tier_id := nullif(v_item->>'tier_id', '')::uuid;
    v_qty := greatest(0, coalesce((v_item->>'quantity')::integer, 0));
    if v_tier_id is null or v_qty < 1 then
      continue;
    end if;

    select *
      into v_tier
    from public.ticket_tiers as tt
    where tt.id = v_tier_id
      and tt.event_id = p_event_id
    for update of tt;

    if not found then
      raise exception 'Ticket tier no encontrado'
        using errcode = 'P0002';
    end if;

    select coalesce(h.quantity, 0)
      into v_prev
    from public.event_ga_cart_holds as h
    where h.event_id = p_event_id
      and h.owner_id = p_owner_id
      and h.tier_id = v_tier_id;

    v_delta := v_qty - coalesce(v_prev, 0);

    if v_delta > 0 then
      perform public.assert_cascade_stock_available(
        p_event_id,
        v_tier_id,
        v_delta,
        null
      );
    end if;

    if v_delta <> 0 then
      update public.ticket_tiers
      set sold = greatest(0, sold + v_delta)
      where id = v_tier_id;
    end if;

    insert into public.event_ga_cart_holds (
      event_id,
      tier_id,
      owner_id,
      quantity,
      reserved_until
    )
    values (
      p_event_id,
      v_tier_id,
      p_owner_id,
      v_qty,
      v_until
    )
    on conflict (event_id, owner_id, tier_id)
    do update set
      quantity = excluded.quantity,
      reserved_until = excluded.reserved_until;

    v_keep := array_append(v_keep, v_tier_id);
    v_held := true;
    if v_until < v_min then
      v_min := v_until;
    end if;
  end loop;

  if not v_held then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  for v_stale in
    select *
    from public.event_ga_cart_holds as h
    where h.event_id = p_event_id
      and h.owner_id = p_owner_id
      and not (h.tier_id = any (v_keep))
    for update
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_stale.quantity)
    where id = v_stale.tier_id;

    delete from public.event_ga_cart_holds where id = v_stale.id;
  end loop;

  reserved_until := v_min;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) atomic path: same convert + event fees, keep reservation row shape
-- -----------------------------------------------------------------------------
create or replace function public.reserve_tickets_atomic(
  p_event_id uuid,
  p_owner_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_phase_id uuid default null
)
returns table (
  reservation_id uuid,
  order_id uuid,
  phase_id uuid,
  ticket_id uuid,
  unit_price numeric,
  quantity integer
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_items jsonb;
  v_row record;
  v_reservation_id uuid := gen_random_uuid();
  v_order_id uuid;
  v_unit_price numeric(12, 2) := 0;
  v_first boolean := true;
begin
  perform set_config('lock_timeout', '4s', true);

  v_items := jsonb_build_array(
    jsonb_build_object(
      'tier_id', p_tier_id,
      'quantity', p_quantity,
      'phase_id', p_phase_id
    )
  );

  for v_row in
    select *
    from public.claim_and_reserve_ga_cart_tx(
      p_event_id,
      p_owner_id,
      v_items,
      null
    )
  loop
    if v_first then
      v_order_id := v_row.order_id;
      if p_quantity > 0 then
        v_unit_price := round(v_row.subtotal / p_quantity, 2);
      end if;

      insert into public.ticket_reservations (
        id,
        event_id,
        tier_id,
        phase_id,
        owner_id,
        order_id,
        quantity,
        unit_price,
        status
      )
      values (
        v_reservation_id,
        p_event_id,
        p_tier_id,
        p_phase_id,
        p_owner_id,
        v_order_id,
        p_quantity,
        v_unit_price,
        'held'
      );

      v_first := false;
    end if;

    reservation_id := v_reservation_id;
    order_id := v_row.order_id;
    phase_id := p_phase_id;
    ticket_id := v_row.ticket_id;
    unit_price := v_unit_price;
    quantity := p_quantity;
    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) list_cart_holds — rehydrate mapa / qty from server
-- -----------------------------------------------------------------------------
create or replace function public.list_cart_holds(
  p_event_id uuid,
  p_owner_id uuid
)
returns table (
  hold_kind text,
  tier_id uuid,
  quantity integer,
  seating_unit_id uuid,
  layout_item_id text,
  label text,
  reserved_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  select
    'ga'::text,
    h.tier_id,
    h.quantity,
    null::uuid,
    null::text,
    null::text,
    h.reserved_until
  from public.event_ga_cart_holds as h
  where h.event_id = p_event_id
    and h.owner_id = p_owner_id
    and h.reserved_until > clock_timestamp()
  union all
  select
    'seat'::text,
    u.tier_id,
    1,
    u.id,
    u.layout_item_id,
    u.label,
    u.reserved_until
  from public.event_seating_units as u
  where u.event_id = p_event_id
    and u.reserved_by is not distinct from p_owner_id
    and u.status = 'reserved'
    and u.reserved_order_id is null
    and u.reserved_until > clock_timestamp();
end;
$$;

revoke all on function public.ticket_day_is_full_pass(text) from public;
grant execute on function public.ticket_day_is_full_pass(text)
  to authenticated, service_role;

revoke all on function public.event_schedule_day_ids(uuid) from public;
grant execute on function public.event_schedule_day_ids(uuid)
  to authenticated, service_role;

revoke all on function public.event_occupied_day_units(uuid, text) from public;
grant execute on function public.event_occupied_day_units(uuid, text)
  to authenticated, service_role;

revoke all on function public.consume_ga_cart_hold_for_reserve(uuid, uuid, uuid, integer)
  from public, anon;
grant execute on function public.consume_ga_cart_hold_for_reserve(uuid, uuid, uuid, integer)
  to authenticated, service_role;

revoke all on function public.apply_ga_stock_for_reserve(uuid, uuid, uuid, integer, uuid)
  from public, anon;
grant execute on function public.apply_ga_stock_for_reserve(uuid, uuid, uuid, integer, uuid)
  to authenticated, service_role;

revoke all on function public.list_cart_holds(uuid, uuid) from public, anon;
grant execute on function public.list_cart_holds(uuid, uuid)
  to authenticated, service_role;
