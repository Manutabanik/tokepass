-- =============================================================================
-- P133 · Aforo de produccion aislado de ventas de prueba / borrador
-- Las compras is_test o sobre eventos sandbox no incrementan ticket_tiers.sold.
-- Al pasar a revision o publicado se purgan tickets de prueba y se reconstruye sold.
-- =============================================================================

create or replace function public.event_uses_live_stock(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and not public.is_sandbox_event_status(e.status)
  );
$$;

comment on function public.event_uses_live_stock(uuid) is
  'True si el evento ya no es borrador/revision: el aforo publicado cuenta.';

revoke all on function public.event_uses_live_stock(uuid) from public;
grant execute on function public.event_uses_live_stock(uuid)
  to authenticated, service_role;

create or replace function public.ticket_tiers_ignore_sandbox_sold_increment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if current_setting('tokepass.resetting_test_inventory', true) = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and coalesce(new.sold, 0) is distinct from coalesce(old.sold, 0)
     and not public.event_uses_live_stock(new.event_id) then
    -- Congela sold en sandbox: ni POS/checkout ni expires de holds tocan aforo real.
    new.sold := old.sold;
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_tiers_ignore_sandbox_sold_increment on public.ticket_tiers;
create trigger ticket_tiers_ignore_sandbox_sold_increment
before update of sold
on public.ticket_tiers
for each row
execute function public.ticket_tiers_ignore_sandbox_sold_increment();

create or replace function public.ticket_tier_phases_ignore_sandbox_sold_increment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_id uuid;
begin
  if current_setting('tokepass.resetting_test_inventory', true) = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and coalesce(new.sold, 0) is distinct from coalesce(old.sold, 0) then
    select tt.event_id
      into v_event_id
    from public.ticket_tiers as tt
    where tt.id = new.tier_id;

    if v_event_id is not null
       and not public.event_uses_live_stock(v_event_id) then
      new.sold := old.sold;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_tier_phases_ignore_sandbox_sold_increment
  on public.ticket_tier_phases;
create trigger ticket_tier_phases_ignore_sandbox_sold_increment
before update of sold
on public.ticket_tier_phases
for each row
execute function public.ticket_tier_phases_ignore_sandbox_sold_increment();

create or replace function public.reset_event_test_inventory_internal(
  p_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
begin
  if p_event_id is null then
    raise exception 'event_id requerido' using errcode = '22023';
  end if;

  if not exists (select 1 from public.events as e where e.id = p_event_id) then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;

  perform set_config('tokepass.resetting_test_inventory', '1', true);

  delete from public.event_ga_cart_holds
  where event_id = p_event_id;

  -- FKs RESTRICT: hay que soltar cesiones/reventas antes de borrar tickets de prueba.
  delete from public.ticket_action_consents as c
  where exists (
    select 1
    from public.tickets as t
    where t.id = c.ticket_id
      and t.event_id = p_event_id
      and coalesce(t.is_test, false) = true
  );

  delete from public.payouts_pending as pay
  where exists (
    select 1
    from public.ticket_resale_listings as l
    join public.tickets as t on t.id = l.ticket_id
    where l.id = pay.listing_id
      and t.event_id = p_event_id
      and coalesce(t.is_test, false) = true
  );

  delete from public.ticket_resale_listings as l
  where exists (
    select 1
    from public.tickets as t
    where t.id = l.ticket_id
      and t.event_id = p_event_id
      and coalesce(t.is_test, false) = true
  );

  delete from public.ticket_transfers as tr
  where exists (
    select 1
    from public.tickets as t
    where t.event_id = p_event_id
      and coalesce(t.is_test, false) = true
      and t.id in (tr.original_ticket_id, tr.new_ticket_id)
  );

  delete from public.tickets as t
  where t.event_id = p_event_id
    and coalesce(t.is_test, false) = true;

  get diagnostics v_deleted = row_count;

  update public.orders as o
  set
    is_test = true,
    environment = 'test',
    updated_at = now()
  where exists (
      select 1
      from public.tickets as t
      where t.order_id = o.id
        and t.event_id = p_event_id
    )
    and not exists (
      select 1
      from public.tickets as t
      where t.order_id = o.id
        and t.event_id = p_event_id
        and coalesce(t.is_test, false) = false
    )
    and (
      coalesce(o.is_test, false) = false
      or o.environment is distinct from 'test'
    );

  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    sold_order_id = null,
    updated_at = now()
  where u.event_id = p_event_id
    and u.status in ('sold', 'reserved')
    and (
      exists (
        select 1
        from public.orders as o
        where o.id in (u.sold_order_id, u.reserved_order_id)
          and coalesce(o.is_test, false) = true
      )
      or not exists (
        select 1
        from public.tickets as t
        where t.seating_unit_id = u.id
          and coalesce(t.is_test, false) = false
          and t.status not in (
            'cancelled'::public.ticket_status,
            'revoked'::public.ticket_status
          )
      )
    );

  update public.ticket_tiers as tt
  set sold = coalesce(units.qty, 0)
  from (
    select
      t.tier_id,
      count(
        distinct coalesce(nullif(t.group_id::text, ''), t.id::text)
      )::integer as qty
    from public.tickets as t
    left join public.orders as o on o.id = t.order_id
    where t.event_id = p_event_id
      and coalesce(t.is_test, false) = false
      and coalesce(o.is_test, false) = false
      and t.status not in (
        'cancelled'::public.ticket_status,
        'revoked'::public.ticket_status
      )
    group by t.tier_id
  ) as units
  where tt.id = units.tier_id
    and tt.event_id = p_event_id;

  update public.ticket_tiers as tt
  set sold = 0
  where tt.event_id = p_event_id
    and not exists (
      select 1
      from public.tickets as t
      left join public.orders as o on o.id = t.order_id
      where t.tier_id = tt.id
        and coalesce(t.is_test, false) = false
        and coalesce(o.is_test, false) = false
        and t.status not in (
          'cancelled'::public.ticket_status,
          'revoked'::public.ticket_status
        )
    );

  update public.ticket_tier_phases as p
  set sold = coalesce(units.qty, 0)
  from (
    select
      t.phase_id,
      count(
        distinct coalesce(nullif(t.group_id::text, ''), t.id::text)
      )::integer as qty
    from public.tickets as t
    left join public.orders as o on o.id = t.order_id
    where t.event_id = p_event_id
      and t.phase_id is not null
      and coalesce(t.is_test, false) = false
      and coalesce(o.is_test, false) = false
      and t.status not in (
        'cancelled'::public.ticket_status,
        'revoked'::public.ticket_status
      )
    group by t.phase_id
  ) as units
  where p.id = units.phase_id;

  update public.ticket_tier_phases as p
  set sold = 0
  where p.tier_id in (
      select tt.id from public.ticket_tiers as tt where tt.event_id = p_event_id
    )
    and not exists (
      select 1
      from public.tickets as t
      left join public.orders as o on o.id = t.order_id
      where t.phase_id = p.id
        and t.event_id = p_event_id
        and coalesce(t.is_test, false) = false
        and coalesce(o.is_test, false) = false
        and t.status not in (
          'cancelled'::public.ticket_status,
          'revoked'::public.ticket_status
        )
    );

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.reset_event_test_inventory_internal(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_event_test_inventory_internal(uuid)
  to service_role;

create or replace function public.reset_event_test_inventory(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_organizer_id uuid;
begin
  select e.organizer_id
    into v_organizer_id
  from public.events as e
  where e.id = p_event_id;

  if v_organizer_id is null then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from v_organizer_id
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return public.reset_event_test_inventory_internal(p_event_id);
end;
$$;

comment on function public.reset_event_test_inventory(uuid) is
  'Borra tickets de prueba, libera asientos de test y reconstruye sold de produccion.';

revoke all on function public.reset_event_test_inventory(uuid) from public;
revoke all on function public.reset_event_test_inventory(uuid) from anon;
grant execute on function public.reset_event_test_inventory(uuid)
  to authenticated, service_role;

create or replace function public.purge_event_test_tickets(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.reset_event_test_inventory(p_event_id);
end;
$$;

create or replace function public.events_reset_test_inventory_on_go_live()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.is_sandbox_event_status(old.status)
     and not public.is_sandbox_event_status(new.status) then
    perform public.reset_event_test_inventory_internal(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists events_reset_test_inventory_on_go_live_trg on public.events;
create trigger events_reset_test_inventory_on_go_live_trg
after update of status
on public.events
for each row
execute function public.events_reset_test_inventory_on_go_live();

-- Sector logico: no bloquear simulaciones por leftover sold de prueba.
create or replace function public.assert_logical_sector_stock(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sector text;
  v_slug text;
  v_zone public.event_zones%rowtype;
  v_used integer := 0;
  v_additional integer := greatest(0, coalesce(p_quantity, 0));
begin
  if not public.event_uses_live_stock(p_event_id) then
    return;
  end if;

  select nullif(btrim(coalesce(tt.seating_sector_id, '')), '')
    into v_sector
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
    and tt.event_id = p_event_id;

  if v_sector is null or v_sector not like 'general:%' then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_event_id::text),
    hashtext(v_sector)
  );

  perform 1
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  v_slug := lower(split_part(v_sector, ':', 2));

  select z.*
    into v_zone
  from public.event_zones as z
  where z.event_id = p_event_id
    and z.type = 'general_admission'
    and (
      lower(replace(z.name, ' ', '-')) = v_slug
      or lower(z.name) = replace(v_slug, '-', ' ')
    )
  order by z.id
  for update of z
  limit 1;

  if not found then
    return;
  end if;

  select coalesce(sum(tt.sold), 0)::integer
    into v_used
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.seating_sector_id = v_sector;

  if (v_used + v_additional) > v_zone.capacity then
    raise exception 'INVENTORY_CONFLICT_409'
      using errcode = 'P0001';
  end if;
end;
$$;

-- Catalogo publico: en sandbox el aforo publicado se muestra intacto.
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
  if not public.event_uses_live_stock(p_event_id) then
    return query
    select
      tt.id,
      coalesce(tt.total_capacity, tt.capacity)::integer,
      0::integer,
      coalesce(tt.total_capacity, tt.capacity)::integer,
      coalesce(tt.total_capacity, tt.capacity)::integer
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id;
    return;
  end if;

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

-- Checkout: en sandbox no agotar aforo/fase/recinto (el trigger ya congela sold).
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
  v_people_additional integer;
  v_day text;
  v_used integer;
  v_has_day boolean := false;
  v_expired integer := 0;
  v_sandbox boolean := false;
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

  v_sandbox := public.is_sandbox_event_status(v_event.status);

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

  if v_sandbox then
    v_tier.sold := 0;
    v_event.venue_id := null;
  end if;

  v_people_additional := public.ticket_tier_venue_people(
    v_additional,
    v_tier.layout_type,
    v_tier.capacity_per_unit
  );

  select coalesce(sum(h.quantity), 0)::integer
    into v_expired
  from public.event_ga_cart_holds as h
  where h.tier_id = p_tier_id
    and h.reserved_until <= clock_timestamp();

  if v_sandbox then
    v_expired := 0;
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
        if v_people_additional > greatest(0, v_venue_cap - v_used) then
          raise exception 'Capacidad física del recinto insuficiente'
            using errcode = 'P0001';
        end if;
      end loop;

      if not v_has_day then
        v_used := public.event_occupied_venue_units(p_event_id);
        v_venue_left := greatest(0, v_venue_cap - v_used);
        if v_people_additional > v_venue_left then
          raise exception 'Capacidad física del recinto insuficiente'
            using errcode = 'P0001';
        end if;
      end if;
    else
      v_used := public.event_occupied_day_units(p_event_id, v_tier.day_id::text);
      v_venue_left := greatest(0, v_venue_cap - v_used);
      if v_people_additional > v_venue_left then
        raise exception 'Capacidad física del recinto insuficiente'
          using errcode = 'P0001';
      end if;
    end if;
  else
    v_venue_left := null;
  end if;

  v_tier_cap := coalesce(v_tier.total_capacity, v_tier.capacity);
  if not v_sandbox
     and (v_tier_cap - v_tier.sold + v_expired) < v_additional then
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

    if v_sandbox then
      v_phase.sold := 0;
    end if;

    if v_phase.status = 'sold_out' and not v_sandbox then
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
      if not v_sandbox and v_additional > v_phase_left then
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

comment on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) is
  'Valida stock en cascada. En sandbox no agota aforo publicado. Recinto: table_combo = qty * capacity_per_unit.';

revoke all on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) from public;
revoke all on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) from anon;
grant execute on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid)
  to authenticated, service_role;

-- POS: solo descuenta sold/aforo si el evento ya usa inventario publicado.
create or replace function public.process_pos_checkout_tx(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_cashier_user_id uuid,
  p_customer_phone text default null,
  p_customer_dni text default null,
  p_customer_name text default null,
  p_shift_id uuid default null,
  p_supervisor_pin text default null,
  p_seating_unit_id uuid default null,
  p_seating_layout_item_id text default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  totp_secret text,
  qr_code text,
  unit_price numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_event public.events%rowtype;
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event uuid;
  v_admit integer;
  v_tier_name text;
  v_layout text;
  v_order_id uuid;
  v_subtotal numeric(12, 2);
  v_method text;
  v_phone text;
  v_dni text;
  v_name text;
  v_unit integer;
  v_slot integer;
  v_ticket_id uuid;
  v_secret text;
  v_qr text;
  v_group_id uuid;
  v_rate numeric(5, 4) := 0.15;
  v_shift public.cashier_shifts%rowtype;
  v_needs_pin boolean := false;
  v_layout_item text;
  v_seating public.event_seating_units%rowtype;
  v_has_seating boolean := false;
  v_live_stock boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_cashier_user_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_method := public.normalize_pos_payment_method(p_payment_method);
  if v_method is null then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  v_dni := nullif(regexp_replace(coalesce(p_customer_dni, ''), '\D', '', 'g'), '');
  if v_dni is null or length(v_dni) < 7 or length(v_dni) > 11 then
    raise exception 'DNI_REQUIRED' using errcode = '22023';
  end if;

  v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  if v_name is null then
    v_name := 'Comprador POS';
  end if;

  v_layout_item := nullif(btrim(coalesce(p_seating_layout_item_id, '')), '');
  v_has_seating := p_seating_unit_id is not null or v_layout_item is not null;
  if v_has_seating and p_quantity <> 1 then
    raise exception 'SEATING_QTY_ONE' using errcode = '23514';
  end if;

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_live_stock := public.event_uses_live_stock(p_event_id);

  if not public.user_can_operate_pos(p_event_id, p_cashier_user_id) then
    raise exception 'FORBIDDEN_EVENT' using errcode = '42501';
  end if;

  if v_event.status::text not in ('published', 'draft') then
    raise exception 'EVENT_NOT_SELLABLE' using errcode = '23514';
  end if;

  if p_shift_id is not null then
    select * into v_shift
    from public.cashier_shifts s
    where s.id = p_shift_id
    for update of s;
  else
    select * into v_shift
    from public.cashier_shifts s
    where s.event_id = p_event_id
      and s.cashier_id = p_cashier_user_id
      and s.status = 'open'
    for update of s
    limit 1;
  end if;

  if not found then
    raise exception 'SHIFT_REQUIRED' using errcode = 'P0001';
  end if;

  if v_shift.status <> 'open'
     or v_shift.event_id is distinct from p_event_id
     or v_shift.cashier_id is distinct from p_cashier_user_id then
    raise exception 'SHIFT_INVALID' using errcode = '23514';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_event.organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  select
    tt.event_id,
    tt.price,
    coalesce(
      tt.platform_fee,
      public.all_in_platform_fee(coalesce(tt.base_price, tt.price), v_rate)
    ),
    tt.capacity,
    tt.sold,
    greatest(1, least(50, coalesce(tt.admit_count, 1))),
    tt.name,
    tt.layout_type::text
    into
      v_tier_event,
      v_price,
      v_unit_fee,
      v_capacity,
      v_sold,
      v_admit,
      v_tier_name,
      v_layout
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found then
    raise exception 'TIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tier_event is distinct from p_event_id then
    raise exception 'TIER_EVENT_MISMATCH' using errcode = '23514';
  end if;

  if v_has_seating then
    if p_seating_unit_id is not null then
      select * into v_seating
      from public.event_seating_units as u
      where u.id = p_seating_unit_id
        and u.event_id = p_event_id
      for update of u;
    else
      select * into v_seating
      from public.event_seating_units as u
      where u.event_id = p_event_id
        and u.layout_item_id = v_layout_item
        and u.tier_id = p_tier_id
      for update of u
      limit 1;
    end if;

    if not found then
      raise exception 'SEATING_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_seating.tier_id is distinct from p_tier_id then
      raise exception 'SEATING_TIER_MISMATCH' using errcode = '23514';
    end if;

    if v_seating.status::text <> 'available' then
      raise exception 'Sold out' using errcode = 'P0001';
    end if;
  end if;

  v_needs_pin :=
    coalesce(v_price, 0) <= 0
    or lower(coalesce(v_tier_name, '')) like '%freepass%'
    or lower(coalesce(v_tier_name, '')) like '%cortes%';

  if v_needs_pin then
    if not public.verify_pos_supervisor_pin(p_event_id, p_supervisor_pin) then
      raise exception 'SUPERVISOR_PIN_REQUIRED' using errcode = '42501';
    end if;
    v_unit_fee := 0;
    v_price := 0;
  end if;

  if v_live_stock then
    perform public.assert_logical_sector_stock(
      p_event_id,
      p_tier_id,
      p_quantity
    );

    if (v_capacity - v_sold) < p_quantity then
      raise exception 'Sold out' using errcode = 'P0001';
    end if;

    update public.ticket_tiers
    set sold = sold + p_quantity
    where id = p_tier_id;
  end if;

  v_subtotal := round(v_price * p_quantity, 2);
  v_phone := nullif(btrim(coalesce(p_customer_phone, '')), '');

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    payment_method,
    customer_phone,
    cashier_shift_id,
    cashier_user_id,
    is_test,
    environment
  )
  values (
    p_cashier_user_id,
    v_subtotal,
    round(v_unit_fee * p_quantity, 2),
    v_subtotal,
    'paid',
    v_method,
    v_phone,
    v_shift.id,
    p_cashier_user_id,
    not v_live_stock,
    case when v_live_stock then 'production' else 'test' end
  )
  returning id into v_order_id;

  if v_has_seating then
    update public.event_seating_units
    set
      status = 'sold',
      sold_order_id = v_order_id,
      reserved_by = null,
      reserved_order_id = null,
      reserved_until = null,
      updated_at = now()
    where id = v_seating.id
      and status::text = 'available';

    if not found then
      raise exception 'Sold out' using errcode = 'P0001';
    end if;
  end if;

  for v_unit in 1..p_quantity loop
    v_group_id := case when v_admit > 1 then gen_random_uuid() else null end;

    for v_slot in 1..v_admit loop
      v_secret := encode(extensions.gen_random_bytes(24), 'hex');
      v_qr := 'pos_' || replace(gen_random_uuid()::text, '-', '');

      insert into public.tickets (
        event_id,
        tier_id,
        owner_id,
        qr_code,
        status,
        order_id,
        is_dynamic_qr,
        totp_secret,
        holder_name,
        holder_dni,
        group_id,
        group_slot,
        max_admissions,
        admissions_used,
        seating_unit_id,
        is_test
      )
      values (
        p_event_id,
        p_tier_id,
        p_cashier_user_id,
        v_qr,
        'valid'::public.ticket_status,
        v_order_id,
        false,
        v_secret,
        v_name,
        v_dni,
        v_group_id,
        case when v_admit > 1 then v_slot else null end,
        1,
        0,
        case when v_has_seating then v_seating.id else null end,
        not v_live_stock
      )
      returning id into v_ticket_id;

      order_id := v_order_id;
      ticket_id := v_ticket_id;
      totp_secret := v_secret;
      qr_code := v_qr;
      unit_price := v_price;
      total_amount := v_subtotal;
      return next;
    end loop;

    begin
      perform public.fulfill_tier_combo_items(
        v_order_id,
        p_tier_id,
        p_cashier_user_id,
        'valid'
      );
    exception
      when undefined_function then null;
    end;
  end loop;

  update public.cashier_shifts
  set
    cash_sales_total = cash_sales_total
      + case when v_method = 'cash_pos' then v_subtotal else 0 end,
    card_sales_total = card_sales_total
      + case when v_method = 'card_pos' then v_subtotal else 0 end,
    transfer_sales_total = transfer_sales_total
      + case when v_method = 'transfer_pos' then v_subtotal else 0 end,
    tickets_sold = tickets_sold + (p_quantity * v_admit),
    updated_at = now()
  where id = v_shift.id;
end;
$$;

comment on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text
) is
  'Checkout presencial atomico. sold++ solo si el evento usa aforo publicado.';

-- Si una orden publicada se marca como prueba, devolver el aforo que consumio.
create or replace function public.release_test_order_live_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_id uuid;
begin
  if p_order_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.orders as o
    where o.id = p_order_id
      and coalesce(o.is_test, false) = true
  ) then
    return;
  end if;

  select t.event_id
    into v_event_id
  from public.tickets as t
  where t.order_id = p_order_id
  limit 1;

  if v_event_id is null or not public.event_uses_live_stock(v_event_id) then
    return;
  end if;

  update public.ticket_tiers as tt
  set sold = greatest(0, tt.sold - coalesce(units.qty, 0))
  from (
    select
      t.tier_id,
      count(
        distinct coalesce(nullif(t.group_id::text, ''), t.id::text)
      )::integer as qty
    from public.tickets as t
    where t.order_id = p_order_id
      and t.status not in (
        'cancelled'::public.ticket_status,
        'revoked'::public.ticket_status
      )
    group by t.tier_id
  ) as units
  where tt.id = units.tier_id
    and tt.event_id = v_event_id;

  update public.ticket_tier_phases as p
  set sold = greatest(0, p.sold - coalesce(units.qty, 0))
  from (
    select
      t.phase_id,
      count(
        distinct coalesce(nullif(t.group_id::text, ''), t.id::text)
      )::integer as qty
    from public.tickets as t
    where t.order_id = p_order_id
      and t.phase_id is not null
      and t.status not in (
        'cancelled'::public.ticket_status,
        'revoked'::public.ticket_status
      )
    group by t.phase_id
  ) as units
  where p.id = units.phase_id;

  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    sold_order_id = null,
    updated_at = now()
  where u.event_id = v_event_id
    and u.status in ('sold', 'reserved')
    and u.id in (
      select t.seating_unit_id
      from public.tickets as t
      where t.order_id = p_order_id
        and t.seating_unit_id is not null
    );
end;
$$;

revoke all on function public.release_test_order_live_stock(uuid)
  from public, anon, authenticated;
grant execute on function public.release_test_order_live_stock(uuid)
  to service_role;

create or replace function public.finalize_sandbox_paid_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  perform public.release_test_order_live_stock(p_order_id);

  update public.orders
  set
    is_test = true,
    environment = 'test',
    legal_consent_required = false,
    updated_at = now()
  where id = p_order_id
    and status = 'pending';

  v_result := public.finalize_paid_order(
    p_order_id,
    'mercadopago',
    'sandbox:' || p_order_id::text,
    jsonb_build_object('sandbox', true)
  );

  if coalesce(v_result ->> 'ok', 'false') = 'true' then
    update public.orders
    set
      payment_method = 'test_sandbox',
      payment_provider = 'sandbox',
      is_test = true,
      environment = 'test',
      legal_consent_required = false,
      updated_at = now()
    where id = p_order_id;

    update public.tickets
    set
      is_test = true,
      updated_at = now()
    where order_id = p_order_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.finalize_sandbox_paid_order(uuid) from public;
grant execute on function public.finalize_sandbox_paid_order(uuid)
  to service_role;

create or replace function public.mark_order_test_sandbox(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform public.release_test_order_live_stock(p_order_id);

  update public.orders
  set
    payment_method = 'test_sandbox',
    payment_provider = 'sandbox',
    is_test = true,
    environment = 'test',
    legal_consent_required = false,
    updated_at = now()
  where id = p_order_id
    and status = 'paid';

  if not found then
    return false;
  end if;

  update public.tickets
  set
    is_test = true,
    updated_at = now()
  where order_id = p_order_id;

  return true;
end;
$$;

revoke all on function public.mark_order_test_sandbox(uuid) from public;
grant execute on function public.mark_order_test_sandbox(uuid)
  to service_role;

-- Sana eventos que todavia estan en borrador/revision: sold solo de produccion.
do $$
declare
  v_event uuid;
begin
  for v_event in
    select e.id
    from public.events as e
    where public.is_sandbox_event_status(e.status)
  loop
    perform public.reset_event_test_inventory_internal(v_event);
  end loop;
end;
$$;
