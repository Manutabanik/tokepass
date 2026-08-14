-- P71: Fases de venta en cascada (lotes) + stock atómico con row-level locking.
-- RAISE EXCEPTION aborta la función y hace ROLLBACK de la transacción actual.

-- -----------------------------------------------------------------------------
-- 1) venues.max_capacity  /  ticket_tiers.total_capacity
--    Se mantienen alineados a capacity para no romper RPCs existentes.
-- -----------------------------------------------------------------------------
alter table public.venues
  add column if not exists max_capacity integer;

update public.venues
set max_capacity = capacity
where max_capacity is null;

alter table public.venues
  alter column max_capacity set default 1;

update public.venues
set max_capacity = greatest(1, capacity)
where max_capacity is null or max_capacity < 1;

alter table public.venues
  alter column max_capacity set not null;

alter table public.venues
  drop constraint if exists venues_max_capacity_check;

alter table public.venues
  add constraint venues_max_capacity_check
  check (max_capacity >= 1);

comment on column public.venues.max_capacity is
  'Presupuesto físico del recinto. Fuente de verdad para no sobrevender el predio.';

alter table public.ticket_tiers
  add column if not exists total_capacity integer;

update public.ticket_tiers
set total_capacity = capacity
where total_capacity is null;

alter table public.ticket_tiers
  alter column total_capacity set default 0;

update public.ticket_tiers
set total_capacity = capacity
where total_capacity is null;

alter table public.ticket_tiers
  alter column total_capacity set not null;

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_total_capacity_check;

alter table public.ticket_tiers
  add constraint ticket_tiers_total_capacity_check
  check (total_capacity >= 0);

comment on column public.ticket_tiers.total_capacity is
  'Cupo total del SKU (lote + fases). Se mantiene alineado a capacity.';

create or replace function public.sync_venue_max_capacity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.max_capacity := greatest(1, coalesce(new.max_capacity, new.capacity, 1));
  new.capacity := new.max_capacity;
  return new;
end;
$$;

drop trigger if exists venues_sync_max_capacity on public.venues;
create trigger venues_sync_max_capacity
before insert or update of capacity, max_capacity
on public.venues
for each row
execute function public.sync_venue_max_capacity();

create or replace function public.sync_ticket_tier_total_capacity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.total_capacity := greatest(0, coalesce(new.total_capacity, new.capacity, 0));
  new.capacity := new.total_capacity;
  if new.sold > new.total_capacity then
    raise exception 'El vendido del tier supera total_capacity'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_tiers_sync_total_capacity on public.ticket_tiers;
create trigger ticket_tiers_sync_total_capacity
before insert or update of capacity, total_capacity, sold
on public.ticket_tiers
for each row
execute function public.sync_ticket_tier_total_capacity();

-- -----------------------------------------------------------------------------
-- 2) ticket_tier_phases
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_tier_phase_status'
  ) then
    create type public.ticket_tier_phase_status as enum (
      'scheduled',
      'active',
      'sold_out'
    );
  end if;
end
$$;

create table if not exists public.ticket_tier_phases (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  name text not null check (length(btrim(name)) >= 2),
  price numeric(12, 2) not null check (price >= 0),
  capacity_limit integer check (capacity_limit is null or capacity_limit >= 1),
  sold integer not null default 0 check (sold >= 0),
  start_time timestamptz,
  end_time timestamptz,
  status public.ticket_tier_phase_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  constraint ticket_tier_phases_window_chk check (
    start_time is null
    or end_time is null
    or end_time > start_time
  ),
  constraint ticket_tier_phases_sold_limit_chk check (
    capacity_limit is null or sold <= capacity_limit
  )
);

create index if not exists ticket_tier_phases_tier_id_idx
  on public.ticket_tier_phases (tier_id, status, start_time);

create unique index if not exists ticket_tier_phases_one_active_idx
  on public.ticket_tier_phases (tier_id)
  where status = 'active';

comment on table public.ticket_tier_phases is
  'Lotes / fases de un ticket_tier. Solo una fase active por tier.';
comment on column public.ticket_tier_phases.capacity_limit is
  'Cupo del lote. NULL = sin tope de fase (sigue valiendo total_capacity del tier).';
comment on column public.ticket_tier_phases.sold is
  'Unidades comprometidas de esta fase (holds + pagadas). Solo RPC / trigger.';

create or replace function public.ticket_tier_phases_activate_exclusive()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'active' then
    update public.ticket_tier_phases
    set status = case
      when capacity_limit is not null and sold >= capacity_limit then 'sold_out'::public.ticket_tier_phase_status
      else 'scheduled'::public.ticket_tier_phase_status
    end
    where tier_id = new.tier_id
      and id is distinct from new.id
      and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_tier_phases_activate_exclusive on public.ticket_tier_phases;
create trigger ticket_tier_phases_activate_exclusive
before insert or update of status
on public.ticket_tier_phases
for each row
when (new.status = 'active')
execute function public.ticket_tier_phases_activate_exclusive();

alter table public.tickets
  add column if not exists phase_id uuid references public.ticket_tier_phases(id) on delete set null;

create index if not exists tickets_phase_id_idx
  on public.tickets (phase_id)
  where phase_id is not null;

-- -----------------------------------------------------------------------------
-- 3) ticket_reservations — ledger de holds de la reserva atómica
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_reservation_status'
  ) then
    create type public.ticket_reservation_status as enum (
      'held',
      'confirmed',
      'released'
    );
  end if;
end
$$;

create table if not exists public.ticket_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  phase_id uuid references public.ticket_tier_phases(id) on delete set null,
  owner_id uuid not null references public.profiles(id),
  order_id uuid references public.orders(id) on delete set null,
  quantity integer not null check (quantity >= 1),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  status public.ticket_reservation_status not null default 'held',
  created_at timestamptz not null default now()
);

create index if not exists ticket_reservations_event_idx
  on public.ticket_reservations (event_id, created_at desc);

create index if not exists ticket_reservations_tier_idx
  on public.ticket_reservations (tier_id, status);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.ticket_tier_phases enable row level security;
alter table public.ticket_reservations enable row level security;

revoke all on table public.ticket_tier_phases from public, anon;
revoke all on table public.ticket_reservations from public, anon;

grant select on table public.ticket_tier_phases to anon, authenticated;
grant insert, delete on table public.ticket_tier_phases to authenticated;
grant update (
  name,
  price,
  capacity_limit,
  start_time,
  end_time,
  status
) on table public.ticket_tier_phases to authenticated;
grant all on table public.ticket_tier_phases to service_role;

grant select on table public.ticket_reservations to authenticated;
grant all on table public.ticket_reservations to service_role;

drop policy if exists ticket_tier_phases_select on public.ticket_tier_phases;
create policy ticket_tier_phases_select
  on public.ticket_tier_phases
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.ticket_tiers as tt
      join public.events as e on e.id = tt.event_id
      where tt.id = ticket_tier_phases.tier_id
        and (
          e.status in ('published', 'paused')
          or e.organizer_id = (select auth.uid())
          or exists (
            select 1 from public.profiles as p
            where p.id = (select auth.uid()) and p.role = 'super_admin'
          )
        )
    )
  );

drop policy if exists ticket_tier_phases_write_organizer on public.ticket_tier_phases;
create policy ticket_tier_phases_write_organizer
  on public.ticket_tier_phases
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.ticket_tiers as tt
      join public.events as e on e.id = tt.event_id
      where tt.id = ticket_tier_phases.tier_id
        and (
          e.organizer_id = (select auth.uid())
          or exists (
            select 1 from public.profiles as p
            where p.id = (select auth.uid()) and p.role = 'super_admin'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.ticket_tiers as tt
      join public.events as e on e.id = tt.event_id
      where tt.id = ticket_tier_phases.tier_id
        and (
          e.organizer_id = (select auth.uid())
          or exists (
            select 1 from public.profiles as p
            where p.id = (select auth.uid()) and p.role = 'super_admin'
          )
        )
    )
  );

drop policy if exists ticket_reservations_select_own on public.ticket_reservations;
create policy ticket_reservations_select_own
  on public.ticket_reservations
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.role = 'super_admin'
    )
    or exists (
      select 1
      from public.events as e
      where e.id = ticket_reservations.event_id
        and e.organizer_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- 4) Helpers de ocupación
-- -----------------------------------------------------------------------------
create or replace function public.event_occupied_venue_units(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum(tt.sold), 0)::integer
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.tier_type is distinct from 'addon';
$$;

comment on function public.event_occupied_venue_units(uuid) is
  'Unidades que ocupan aforo físico (excluye adicionales). Usa ticket_tiers.sold.';

create or replace function public.resolve_active_ticket_tier_phase(
  p_tier_id uuid,
  p_phase_id uuid default null
)
returns public.ticket_tier_phases
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_phase public.ticket_tier_phases%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_phase_id is not null then
    select *
      into v_phase
    from public.ticket_tier_phases
    where id = p_phase_id
      and tier_id = p_tier_id;
    return v_phase;
  end if;

  select *
    into v_phase
  from public.ticket_tier_phases
  where tier_id = p_tier_id
    and status = 'active'
  order by start_time nulls last
  limit 1;

  if found then
    return v_phase;
  end if;

  select *
    into v_phase
  from public.ticket_tier_phases
  where tier_id = p_tier_id
    and status = 'scheduled'
    and (start_time is null or start_time <= v_now)
    and (end_time is null or end_time > v_now)
  order by start_time nulls last
  limit 1;

  return v_phase;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Gate atómico: venue + tier + fase
--    Orden de locks: event → tier → venue → phase
--    (compatible con reserve_*_tx, que ya bloquean el tier).
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
  v_venue_used integer := 0;
  v_now timestamptz := clock_timestamp();
  v_tier_cap integer;
  v_phase_left integer;
  v_venue_left integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'La cantidad debe ser mayor a cero'
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

  if v_event.venue_id is not null then
    select *
      into v_venue
    from public.venues as v
    where v.id = v_event.venue_id
    for update of v;

    if not found then
      raise exception 'Lugar del evento no encontrado'
        using errcode = 'P0002';
    end if;

    if v_tier.tier_type is distinct from 'addon' then
      v_venue_used := public.event_occupied_venue_units(p_event_id);
      v_venue_left := greatest(0, coalesce(v_venue.max_capacity, v_venue.capacity) - v_venue_used);
      if p_quantity > v_venue_left then
        raise exception 'Capacidad física del recinto insuficiente'
          using errcode = 'P0001';
      end if;
    else
      v_venue_left := coalesce(v_venue.max_capacity, v_venue.capacity);
    end if;
  else
    v_venue_left := null;
  end if;

  v_tier_cap := coalesce(v_tier.total_capacity, v_tier.capacity);
  if (v_tier_cap - v_tier.sold) < p_quantity then
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
      if p_quantity > v_phase_left then
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

comment on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) is
  'Bloquea venue, ticket_tier y fase activa (FOR UPDATE) y valida aforo. EXCEPTION = rollback.';

-- Si otro RPC incrementa sold, la fase active también consume cupo.
create or replace function public.enforce_cascade_phase_sold()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_delta integer;
  v_phase public.ticket_tier_phases%rowtype;
  v_venue_id uuid;
  v_max integer;
begin
  v_delta := coalesce(new.sold, 0) - coalesce(old.sold, 0);
  if v_delta = 0 then
    return new;
  end if;

  select *
    into v_phase
  from public.ticket_tier_phases as p
  where p.tier_id = new.id
    and p.status = 'active'
  for update of p;

  if found then
    if v_delta > 0
       and v_phase.capacity_limit is not null
       and v_phase.sold + v_delta > v_phase.capacity_limit then
      raise exception 'Capacidad de la fase de venta insuficiente'
        using errcode = 'P0001';
    end if;

    update public.ticket_tier_phases
    set
      sold = greatest(0, sold + v_delta),
      status = case
        when capacity_limit is not null
          and greatest(0, sold + v_delta) >= capacity_limit
          then 'sold_out'::public.ticket_tier_phase_status
        when status = 'sold_out'
          and (capacity_limit is null or greatest(0, sold + v_delta) < capacity_limit)
          then 'active'::public.ticket_tier_phase_status
        else status
      end
    where id = v_phase.id;
  end if;

  if v_delta > 0 and new.tier_type is distinct from 'addon' then
    select e.venue_id
      into v_venue_id
    from public.events as e
    where e.id = new.event_id;

    if v_venue_id is not null then
      select coalesce(v.max_capacity, v.capacity)
        into v_max
      from public.venues as v
      where v.id = v_venue_id
      for update of v;

      if found
         and public.event_occupied_venue_units(new.event_id) > v_max then
        raise exception 'Capacidad física del recinto insuficiente'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ticket_tiers_enforce_cascade_phase on public.ticket_tiers;
create trigger ticket_tiers_enforce_cascade_phase
after update of sold
on public.ticket_tiers
for each row
when (old.sold is distinct from new.sold)
execute function public.enforce_cascade_phase_sold();

-- -----------------------------------------------------------------------------
-- 6) reserve_tickets_atomic
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
  v_gate record;
  v_order_id uuid := gen_random_uuid();
  v_reservation_id uuid := gen_random_uuid();
  v_ticket_id uuid;
  v_price numeric(12, 2);
  v_secret text;
  v_i integer;
begin
  perform set_config('lock_timeout', '4s', true);

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if not public.event_is_buyable(p_event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select *
    into v_gate
  from public.assert_cascade_stock_available(
    p_event_id,
    p_tier_id,
    p_quantity,
    p_phase_id
  );

  v_price := round(coalesce(v_gate.unit_price, 0), 2);

  if v_gate.phase_id is not null then
    update public.ticket_tier_phases
    set status = 'active'
    where id = v_gate.phase_id
      and status is distinct from 'sold_out';
  end if;

  insert into public.orders (
    id,
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status
  )
  values (
    v_order_id,
    p_owner_id,
    round(v_price * p_quantity, 2),
    0,
    round(v_price * p_quantity, 2),
    'pending'
  );

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
    v_gate.phase_id,
    p_owner_id,
    v_order_id,
    p_quantity,
    v_price,
    'held'
  );

  update public.ticket_tiers
  set sold = sold + p_quantity
  where id = p_tier_id;

  for v_i in 1..p_quantity loop
    v_secret := encode(extensions.gen_random_bytes(24), 'hex');

    insert into public.tickets (
      event_id,
      tier_id,
      owner_id,
      qr_code,
      totp_secret,
      status,
      order_id,
      phase_id,
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
      v_gate.phase_id,
      1,
      0
    )
    returning id into v_ticket_id;

    reservation_id := v_reservation_id;
    order_id := v_order_id;
    phase_id := v_gate.phase_id;
    ticket_id := v_ticket_id;
    unit_price := v_price;
    quantity := p_quantity;
    return next;
  end loop;
end;
$$;

comment on function public.reserve_tickets_atomic(uuid, uuid, uuid, integer, uuid) is
  'Reserva atómica con FOR UPDATE de venue, ticket_tier y fase. Cualquier fallo de cupo hace rollback.';

revoke all on function public.event_occupied_venue_units(uuid) from public;
grant execute on function public.event_occupied_venue_units(uuid)
  to authenticated, service_role;

revoke all on function public.resolve_active_ticket_tier_phase(uuid, uuid) from public;
grant execute on function public.resolve_active_ticket_tier_phase(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) from public;
revoke all on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) from anon;
grant execute on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid)
  to authenticated, service_role;

revoke all on function public.reserve_tickets_atomic(uuid, uuid, uuid, integer, uuid) from public;
revoke all on function public.reserve_tickets_atomic(uuid, uuid, uuid, integer, uuid) from anon;
grant execute on function public.reserve_tickets_atomic(uuid, uuid, uuid, integer, uuid)
  to authenticated, service_role;
