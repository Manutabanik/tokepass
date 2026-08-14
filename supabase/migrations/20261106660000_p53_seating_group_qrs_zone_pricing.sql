-- =============================================================================
-- P53: Fase 1 eventos masivos
--  1) Mesa/mapa → N QRs independientes (group_id + group_slot), max_admissions = 1
--  2) Cobro All-In desde zone_tier_pricing (fallback ticket_tiers.price)
--  3) Unique (event, sector, tier) → rangos no superpuestos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3) Matriz: múltiples rangos por sector × tier, sin overlap
-- -----------------------------------------------------------------------------
alter table public.zone_tier_pricing
  drop constraint if exists zone_tier_pricing_event_sector_tier_key;

create index if not exists zone_tier_pricing_lookup_idx
  on public.zone_tier_pricing (event_id, sector_key, ticket_tier_id);

create or replace function public.zone_tier_pricing_assert_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_conflict uuid;
  v_new_lo integer;
  v_new_hi integer;
begin
  -- NULL = abierto: start ausente → 1; end ausente → max int
  v_new_lo := coalesce(new.table_number_start, 1);
  v_new_hi := coalesce(new.table_number_end, 2147483647);

  select z.id
    into v_conflict
  from public.zone_tier_pricing as z
  where z.event_id = new.event_id
    and z.sector_key = new.sector_key
    and z.ticket_tier_id = new.ticket_tier_id
    and z.id is distinct from new.id
    and int4range(
          coalesce(z.table_number_start, 1),
          coalesce(z.table_number_end, 2147483647),
          '[]'
        ) && int4range(v_new_lo, v_new_hi, '[]')
  limit 1;

  if v_conflict is not null then
    raise exception
      'Los rangos de mesa se superponen para el mismo sector y tipo de entrada'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists zone_tier_pricing_no_overlap on public.zone_tier_pricing;
create trigger zone_tier_pricing_no_overlap
  before insert or update of event_id, sector_key, ticket_tier_id,
    table_number_start, table_number_end
  on public.zone_tier_pricing
  for each row
  execute function public.zone_tier_pricing_assert_no_overlap();

comment on function public.zone_tier_pricing_assert_no_overlap() is
  'Impide rangos de mesa superpuestos para el mismo (event, sector_key, ticket_tier).';

-- QRs de mesa: group_slot hasta capacity_per_unit (1–100)
alter table public.tickets
  drop constraint if exists tickets_group_slot_check;

alter table public.tickets
  add constraint tickets_group_slot_check
  check (group_slot is null or group_slot between 1 and 100);

-- -----------------------------------------------------------------------------
-- Precio unitario All-In: matriz zona×tier×rango, si no hay match → tier.price
-- -----------------------------------------------------------------------------
create or replace function public.parse_seating_unit_table_number(p_label text)
returns integer
language sql
immutable
set search_path = pg_catalog, extensions, public
as $$
  select nullif((regexp_match(coalesce(p_label, ''), '([0-9]+)'))[1], '')::integer;
$$;

create or replace function public.resolve_zone_tier_unit_price(
  p_event_id uuid,
  p_ticket_tier_id uuid,
  p_sector_key text default null,
  p_table_number integer default null,
  p_zone_id uuid default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_fallback numeric(12, 2);
  v_sector text;
  v_matrix numeric(12, 2);
begin
  select tt.price, nullif(btrim(coalesce(p_sector_key, tt.seating_sector_id)), '')
    into v_fallback, v_sector
  from public.ticket_tiers as tt
  where tt.id = p_ticket_tier_id
    and tt.event_id = p_event_id;

  if not found then
    return null;
  end if;

  select z.price
    into v_matrix
  from public.zone_tier_pricing as z
  where z.event_id = p_event_id
    and z.ticket_tier_id = p_ticket_tier_id
    and (
      (v_sector is not null and z.sector_key = v_sector)
      or (p_zone_id is not null and z.zone_id = p_zone_id)
    )
    and (
      (
        p_table_number is null
        and z.table_number_start is null
        and z.table_number_end is null
      )
      or (
        p_table_number is not null
        and coalesce(z.table_number_start, 1) <= p_table_number
        and coalesce(z.table_number_end, 2147483647) >= p_table_number
      )
    )
  order by
    case
      when z.table_number_start is not null and z.table_number_end is not null then 3
      when z.table_number_start is not null or z.table_number_end is not null then 2
      else 1
    end desc,
    z.price asc
  limit 1;

  return round(coalesce(v_matrix, v_fallback), 2);
end;
$$;

revoke all on function public.parse_seating_unit_table_number(text) from public;
grant execute on function public.parse_seating_unit_table_number(text)
  to authenticated, service_role;

revoke all on function public.resolve_zone_tier_unit_price(uuid, uuid, text, integer, uuid)
  from public;
grant execute on function public.resolve_zone_tier_unit_price(uuid, uuid, text, integer, uuid)
  to authenticated, service_role;

comment on function public.resolve_zone_tier_unit_price(uuid, uuid, text, integer, uuid) is
  'Precio All-In de cobro: zone_tier_pricing (sector/zona + rango de mesa) o fallback ticket_tiers.price.';

-- Comisión interna sobre precio público All-In (P15: fee ≈ public * rate)
create or replace function public.all_in_platform_fee_from_public(
  p_public numeric,
  p_rate numeric default 0.15
)
returns numeric
language sql
immutable
set search_path = pg_catalog, extensions, public
as $$
  select round(
    coalesce(p_public, 0)
      * greatest(0, least(0.9999, coalesce(p_rate, 0.15))),
    2
  );
$$;

revoke all on function public.all_in_platform_fee_from_public(numeric, numeric)
  from public;
grant execute on function public.all_in_platform_fee_from_public(numeric, numeric)
  to authenticated, service_role;

-- Unidades de inventario (1 mesa / 1 grupo), no filas QR
create or replace function public.count_pending_order_sold_units(p_order_id uuid)
returns table (tier_id uuid, unit_count integer)
language sql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
  select
    t.tier_id,
    count(
      distinct coalesce(
        t.seating_unit_id::text,
        t.group_id::text,
        t.id::text
      )
    )::integer as unit_count
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'pending_payment'::public.ticket_status
  group by t.tier_id;
$$;

-- Cupo anti-scalp: 1 mesa / 1 grupo = 1, no N QRs
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
  select coalesce((
    select count(*)::integer
    from (
      select 1
      from public.tickets as t
      where t.event_id = p_event_id
        and t.owner_id = p_owner_id
        and t.status in (
          'valid'::public.ticket_status,
          'used'::public.ticket_status,
          'scanned'::public.ticket_status
        )
      group by coalesce(
        t.seating_unit_id::text,
        t.group_id::text,
        t.id::text
      )
    ) as units
  ), 0);
$$;

-- -----------------------------------------------------------------------------
-- Trigger: no liberar la mesa si quedan QRs pending del mismo group
-- -----------------------------------------------------------------------------
create or replace function public.sync_seating_unit_from_ticket()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_unit_id uuid;
  v_order_id uuid;
  v_still_pending boolean;
begin
  if tg_op = 'DELETE' then
    v_unit_id := old.seating_unit_id;
    v_order_id := old.order_id;
    if v_unit_id is not null
       and old.status = 'pending_payment'::public.ticket_status then
      select exists (
        select 1
        from public.tickets as t
        where t.seating_unit_id = v_unit_id
          and t.order_id is not distinct from v_order_id
          and t.status = 'pending_payment'::public.ticket_status
          and t.id is distinct from old.id
      ) into v_still_pending;

      if not v_still_pending then
        update public.event_seating_units
        set
          status = 'available',
          reserved_by = null,
          reserved_order_id = null,
          reserved_until = null,
          updated_at = now()
        where id = v_unit_id
          and status = 'reserved'
          and reserved_order_id is not distinct from v_order_id;
      end if;
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
    select exists (
      select 1
      from public.tickets as t
      where t.seating_unit_id = new.seating_unit_id
        and t.order_id is not distinct from new.order_id
        and t.status = 'pending_payment'::public.ticket_status
        and t.id is distinct from new.id
    ) into v_still_pending;

    if not v_still_pending then
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
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Expire: restar sold por unidades, no por QRs
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
      and u.reserved_until <= now()
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
    when undefined_function then null;
  end;

  update public.orders
  set status = 'expired', updated_at = now()
  where id = p_order_id and status = 'pending';

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

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) reserve_tickets_tx — precio de matriz + sector_key / table_number opcionales
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
  v_admit integer;
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

  -- Cupo = unidades de compra (no QRs). admit_count solo expande Living QRs.
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

    if v_tier_id is null or v_quantity <= 0 then
      raise exception 'Cada ítem requiere tier_id y quantity > 0'
        using errcode = '22023';
    end if;

    select
      tt.event_id,
      tt.capacity,
      tt.sold,
      greatest(1, least(50, coalesce(tt.admit_count, 1)))
      into v_tier_event_id, v_capacity, v_sold, v_admit
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

    v_unit_fee := public.all_in_platform_fee_from_public(v_price, v_rate);

    if (v_capacity - v_sold) < v_quantity then
      raise exception 'Sold out'
        using errcode = 'P0001';
    end if;

    update public.ticket_tiers
    set sold = sold + v_quantity
    where id = v_tier_id;

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
          admissions_used
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
          0
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

revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from public;
grant execute on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1) reserve_seating_unit_tx — N QRs + precio de matriz
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
  v_rate numeric(5, 4);
  v_max_per_user integer := 10;
  v_owned_held integer := 0;
  v_order_id uuid := gen_random_uuid();
  v_secret text;
  v_hold_until timestamptz := now() + interval '8 minutes';
  v_qr_count integer;
  v_group_id uuid;
  v_slot integer;
  v_one_id uuid;
  v_ticket_ids uuid[] := '{}';
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_table_number integer;
begin
  perform set_config('lock_timeout', '4s', true);

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
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

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_organizer_id;

  if v_rate is null then
    v_rate := 0.15;
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

  begin
    select * into v_unit
    from public.event_seating_units
    where id = p_seating_unit_id
      and event_id = p_event_id
      and tier_id = p_tier_id
    for update;
  exception
    when lock_not_available then
      raise exception 'SEATING_UNIT_UNAVAILABLE'
        using errcode = 'P0001';
  end;

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

  v_table_number := coalesce(
    public.parse_seating_unit_table_number(v_unit.label),
    public.parse_seating_unit_table_number(v_unit.layout_item_id)
  );

  v_price := public.resolve_zone_tier_unit_price(
    p_event_id,
    p_tier_id,
    v_unit.sector_id,
    v_table_number,
    null
  );

  if v_price is null then
    v_price := round(v_tier.price, 2);
  end if;

  v_unit_fee := public.all_in_platform_fee_from_public(v_price, v_rate);

  v_qr_count := greatest(1, least(100, coalesce(v_unit.capacity_per_unit, 1)));
  v_group_id := case when v_qr_count > 1 then gen_random_uuid() else null end;

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
    round(v_price, 2),
    round(v_unit_fee, 2),
    round(v_price, 2),
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

  begin
    for v_slot in 1..v_qr_count loop
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
        group_id,
        group_slot,
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
        v_group_id,
        case when v_qr_count > 1 then v_slot else null end,
        1,
        0
      )
      returning id into v_one_id;

      v_ticket_ids := array_append(v_ticket_ids, v_one_id);
    end loop;
  exception
    when unique_violation or check_violation then
      raise exception 'No se pudieron emitir los QRs de la ubicación'
        using errcode = 'P0001';
  end;

  if coalesce(array_length(v_ticket_ids, 1), 0) <> v_qr_count then
    raise exception 'No se pudieron emitir los QRs de la ubicación'
      using errcode = 'P0001';
  end if;

  begin
    perform public.fulfill_tier_combo_items(
      v_order_id,
      p_tier_id,
      p_owner_id,
      'pending'
    );
  exception
    when undefined_function then null;
  end;

  foreach v_one_id in array v_ticket_ids
  loop
    order_id := v_order_id;
    ticket_id := v_one_id;
    seating_unit_id := p_seating_unit_id;
    reserved_until := v_hold_until;
    subtotal := round(v_price, 2);
    service_charge := round(v_unit_fee, 2);
    total_amount := round(v_price, 2);
    return next;
  end loop;
end;
$$;

revoke all on function public.reserve_seating_unit_tx(uuid, uuid, uuid, uuid, uuid)
  from public;
revoke all on function public.reserve_seating_unit_tx(uuid, uuid, uuid, uuid, uuid)
  from anon;
grant execute on function public.reserve_seating_unit_tx(uuid, uuid, uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public.reserve_seating_unit_tx(uuid, uuid, uuid, uuid, uuid) is
  'Reserva 1 unidad de mapa, emite capacity_per_unit QRs (group_id) y cobra zone_tier_pricing.';

-- -----------------------------------------------------------------------------
-- finalize_paid_order: al expirar hold, restar sold por unidades (no por QRs)
-- -----------------------------------------------------------------------------
create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_mp_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
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
      if exists (
        select 1
        from public.tickets as t
        join public.event_seating_units as u on u.id = t.seating_unit_id
        where t.order_id = p_order_id
          and t.status = 'pending_payment'::public.ticket_status
          and (
            u.status <> 'reserved'
            or u.reserved_order_id is distinct from p_order_id
            or u.reserved_until <= now()
          )
      ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'order_expired',
          'needs_refund', true
        );
      end if;

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

  if exists (
    select 1
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.order_id = p_order_id
      and not public.is_approved_organizer(e.organizer_id)
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'organizer_suspended',
      'needs_refund', true
    );
  end if;

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
      select s.tier_id, s.unit_count
      from public.count_pending_order_sold_units(p_order_id) as s
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
