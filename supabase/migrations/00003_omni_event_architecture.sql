-- =============================================================================
-- Tokepass - Omni Event Architecture
-- Venues, zonas, asientos, add-ons, promotores, órdenes y Smart Yield.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums y evolución de roles
-- -----------------------------------------------------------------------------

create type public.zone_type as enum (
  'general_admission',
  'reserved_seating'
);

create type public.seat_status as enum (
  'available',
  'locked',
  'sold'
);

-- La comparación en las políticas se realiza mediante role::text para evitar
-- utilizar el nuevo valor del enum dentro de la misma transacción de migración.
alter type public.user_role add value if not exists 'super_admin';

-- -----------------------------------------------------------------------------
-- Motor de recintos y espacios
-- -----------------------------------------------------------------------------

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id),
  name text not null,
  location text not null,
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_zones (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  type public.zone_type not null,
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_zones_event_name_key unique (event_id, name)
);

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.event_zones(id) on delete cascade,
  row_label text not null,
  seat_number text not null,
  status public.seat_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seats_zone_row_number_key
    unique (zone_id, row_label, seat_number)
);

-- -----------------------------------------------------------------------------
-- Motor de RRPP y upselling
-- -----------------------------------------------------------------------------

create table public.promoters (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  commission_percentage numeric(5, 2) not null
    check (commission_percentage >= 0 and commission_percentage <= 100),
  custom_link text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promoters_event_profile_key unique (event_id, profile_id)
);

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  stock integer not null check (stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addons_event_name_key unique (event_id, name)
);

-- -----------------------------------------------------------------------------
-- Evolución del core
-- -----------------------------------------------------------------------------

alter table public.events
  add column venue_id uuid references public.venues(id) on delete set null;

alter table public.ticket_tiers
  add column time_limit time,
  add column bonus_reward text,
  add column zone_id uuid references public.event_zones(id) on delete set null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),
  promoter_id uuid references public.promoters(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tickets
  add column order_id uuid references public.orders(id),
  add column seat_id uuid references public.seats(id),
  add column is_dynamic_qr boolean not null default true;

-- La migración inicial restringe UPDATE de tickets a columnas explícitas.
grant update (status, order_id, seat_id, is_dynamic_qr)
  on public.tickets to authenticated;

-- Relación necesaria para comprar add-ons dentro de una orden.
create table public.order_addons (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  addon_id uuid not null references public.addons(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_addons_order_addon_key unique (order_id, addon_id)
);

-- Un asiento numerado solo puede estar asociado a un ticket.
create unique index tickets_seat_id_key
  on public.tickets (seat_id)
  where seat_id is not null;

-- -----------------------------------------------------------------------------
-- Índices de relaciones y filtros frecuentes
-- -----------------------------------------------------------------------------

create index venues_organizer_id_idx
  on public.venues (organizer_id);

create index events_venue_id_idx
  on public.events (venue_id);

create index event_zones_event_id_idx
  on public.event_zones (event_id);

create index seats_zone_id_status_idx
  on public.seats (zone_id, status);

create index promoters_event_id_idx
  on public.promoters (event_id);

create index promoters_profile_id_idx
  on public.promoters (profile_id);

create index addons_event_id_idx
  on public.addons (event_id);

create index ticket_tiers_zone_id_idx
  on public.ticket_tiers (zone_id);

create index orders_buyer_id_idx
  on public.orders (buyer_id);

create index orders_promoter_id_idx
  on public.orders (promoter_id);

create index orders_status_created_at_idx
  on public.orders (status, created_at);

create index tickets_order_id_idx
  on public.tickets (order_id);

create index order_addons_order_id_idx
  on public.order_addons (order_id);

create index order_addons_addon_id_idx
  on public.order_addons (addon_id);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- Reutiliza public.set_updated_at() creada en la migración fundacional.
-- -----------------------------------------------------------------------------

create trigger venues_set_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

create trigger event_zones_set_updated_at
before update on public.event_zones
for each row execute function public.set_updated_at();

create trigger seats_set_updated_at
before update on public.seats
for each row execute function public.set_updated_at();

create trigger promoters_set_updated_at
before update on public.promoters
for each row execute function public.set_updated_at();

create trigger addons_set_updated_at
before update on public.addons
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create trigger order_addons_set_updated_at
before update on public.order_addons
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Integridad transversal del ticket
-- Impide combinar un tier, asiento u orden pertenecientes a otro evento/usuario.
-- -----------------------------------------------------------------------------

create or replace function public.validate_event_venue()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_venue_organizer_id uuid;
begin
  if new.venue_id is null then
    return new;
  end if;

  select venues.organizer_id
    into v_venue_organizer_id
  from public.venues
  where venues.id = new.venue_id;

  if v_venue_organizer_id is distinct from new.organizer_id then
    raise exception 'Venue does not belong to the event organizer'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger events_validate_venue
before insert or update of venue_id, organizer_id
on public.events
for each row execute function public.validate_event_venue();

create or replace function public.validate_ticket_tier_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_zone_event_id uuid;
begin
  if new.zone_id is null then
    return new;
  end if;

  select event_zones.event_id
    into v_zone_event_id
  from public.event_zones
  where event_zones.id = new.zone_id;

  if v_zone_event_id is distinct from new.event_id then
    raise exception 'Ticket tier zone does not belong to the selected event'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ticket_tiers_validate_zone
before insert or update of event_id, zone_id
on public.ticket_tiers
for each row execute function public.validate_ticket_tier_zone();

create or replace function public.validate_ticket_relations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_related_event_id uuid;
  v_order_buyer_id uuid;
  v_promoter_event_id uuid;
  v_seat_status public.seat_status;
begin
  select tt.event_id
    into v_related_event_id
  from public.ticket_tiers as tt
  where tt.id = new.tier_id;

  if v_related_event_id is distinct from new.event_id then
    raise exception 'Ticket tier does not belong to the selected event'
      using errcode = '23514';
  end if;

  if new.seat_id is not null then
    select ez.event_id, s.status
      into v_related_event_id, v_seat_status
    from public.seats as s
    join public.event_zones as ez on ez.id = s.zone_id
    where s.id = new.seat_id
    for update of s;

    if v_related_event_id is distinct from new.event_id then
      raise exception 'Seat does not belong to the selected event'
        using errcode = '23514';
    end if;

    if v_seat_status = 'sold'::public.seat_status
       and (tg_op = 'INSERT' or old.seat_id is distinct from new.seat_id) then
      raise exception 'Seat is already sold'
        using errcode = '23505';
    end if;
  end if;

  if new.order_id is not null then
    select o.buyer_id, p.event_id
      into v_order_buyer_id, v_promoter_event_id
    from public.orders as o
    left join public.promoters as p on p.id = o.promoter_id
    where o.id = new.order_id;

    if v_order_buyer_id is distinct from new.owner_id then
      raise exception 'Ticket owner does not match the order buyer'
        using errcode = '23514';
    end if;

    if v_promoter_event_id is not null
       and v_promoter_event_id is distinct from new.event_id then
      raise exception 'Promoter does not belong to the ticket event'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger tickets_validate_relations
before insert or update of event_id, tier_id, owner_id, order_id, seat_id
on public.tickets
for each row execute function public.validate_ticket_relations();

-- Mantiene el estado materializado del asiento sincronizado con tickets.
create or replace function public.sync_ticket_seat_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.seat_id is not null then
    update public.seats
    set status = 'available'::public.seat_status
    where id = old.seat_id
      and not exists (
        select 1
        from public.tickets
        where tickets.seat_id = old.seat_id
          and tickets.id <> old.id
      );
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.seat_id is not null then
    update public.seats
    set status = 'sold'::public.seat_status
    where id = new.seat_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger tickets_sync_seat_status
after insert or update of seat_id or delete
on public.tickets
for each row execute function public.sync_ticket_seat_status();

-- -----------------------------------------------------------------------------
-- Helpers de autorización sin recursión RLS
-- SECURITY DEFINER evita que políticas anidadas vuelvan a evaluarse entre sí.
-- -----------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role::text = 'super_admin'
  );
$$;

create or replace function public.owns_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events
    where events.id = p_event_id
      and events.organizer_id = auth.uid()
  );
$$;

create or replace function public.owns_venue(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.venues
    where venues.id = p_venue_id
      and venues.organizer_id = auth.uid()
  );
$$;

create or replace function public.owns_zone(p_zone_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_zones
    join public.events on events.id = event_zones.event_id
    where event_zones.id = p_zone_id
      and events.organizer_id = auth.uid()
  );
$$;

revoke all on function public.is_super_admin() from public;
revoke all on function public.owns_event(uuid) from public;
revoke all on function public.owns_venue(uuid) from public;
revoke all on function public.owns_zone(uuid) from public;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.owns_event(uuid) to authenticated;
grant execute on function public.owns_venue(uuid) to authenticated;
grant execute on function public.owns_zone(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.venues enable row level security;
alter table public.event_zones enable row level security;
alter table public.seats enable row level security;
alter table public.promoters enable row level security;
alter table public.addons enable row level security;
alter table public.orders enable row level security;
alter table public.order_addons enable row level security;

-- Venues: públicos si alojan un evento publicado.
create policy "venues_select_published"
on public.venues
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.events
    where events.venue_id = venues.id
      and events.status = 'published'::public.event_status
  )
);

create policy "venues_manage_own_or_super_admin"
on public.venues
for all
to authenticated
using (
  organizer_id = (select auth.uid())
  or (select public.is_super_admin())
)
with check (
  organizer_id = (select auth.uid())
  or (select public.is_super_admin())
);

-- Zonas: públicas únicamente para eventos publicados.
create policy "event_zones_select_published"
on public.event_zones
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = event_zones.event_id
      and events.status = 'published'::public.event_status
  )
);

create policy "event_zones_manage_owner_or_super_admin"
on public.event_zones
for all
to authenticated
using (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
)
with check (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

-- Asientos: públicos únicamente para eventos publicados.
create policy "seats_select_published"
on public.seats
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.event_zones
    join public.events on events.id = event_zones.event_id
    where event_zones.id = seats.zone_id
      and events.status = 'published'::public.event_status
  )
);

create policy "seats_manage_owner_or_super_admin"
on public.seats
for all
to authenticated
using (
  (select public.owns_zone(zone_id))
  or (select public.is_super_admin())
)
with check (
  (select public.owns_zone(zone_id))
  or (select public.is_super_admin())
);

-- Promotores: visibles para el organizador, el propio promotor y super admin.
create policy "promoters_select_related"
on public.promoters
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

create policy "promoters_manage_owner_or_super_admin"
on public.promoters
for insert
to authenticated
with check (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

create policy "promoters_update_owner_or_super_admin"
on public.promoters
for update
to authenticated
using (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
)
with check (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

create policy "promoters_delete_owner_or_super_admin"
on public.promoters
for delete
to authenticated
using (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

-- Add-ons: públicos para eventos publicados.
create policy "addons_select_published"
on public.addons
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = addons.event_id
      and events.status = 'published'::public.event_status
  )
);

create policy "addons_manage_owner_or_super_admin"
on public.addons
for all
to authenticated
using (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
)
with check (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

-- Órdenes: el comprador administra su carrito pendiente y puede leer su orden.
create policy "orders_select_own"
on public.orders
for select
to authenticated
using (
  buyer_id = (select auth.uid())
  or (select public.is_super_admin())
);

create policy "orders_insert_own_pending"
on public.orders
for insert
to authenticated
with check (
  (
    buyer_id = (select auth.uid())
    and status = 'pending'
  )
  or (select public.is_super_admin())
);

create policy "orders_update_own_pending"
on public.orders
for update
to authenticated
using (
  (
    buyer_id = (select auth.uid())
    and status = 'pending'
  )
  or (select public.is_super_admin())
)
with check (
  (
    buyer_id = (select auth.uid())
    and status = 'pending'
  )
  or (select public.is_super_admin())
);

create policy "orders_delete_own_pending"
on public.orders
for delete
to authenticated
using (
  (
    buyer_id = (select auth.uid())
    and status = 'pending'
  )
  or (select public.is_super_admin())
);

-- Ítems de add-ons: siguen la propiedad y estado de la orden.
create policy "order_addons_select_own_order"
on public.order_addons
for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_addons.order_id
      and orders.buyer_id = (select auth.uid())
  )
  or (select public.is_super_admin())
);

create policy "order_addons_insert_own_pending_order"
on public.order_addons
for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders
    where orders.id = order_addons.order_id
      and orders.buyer_id = (select auth.uid())
      and orders.status = 'pending'
  )
  or (select public.is_super_admin())
);

create policy "order_addons_update_own_pending_order"
on public.order_addons
for update
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_addons.order_id
      and orders.buyer_id = (select auth.uid())
      and orders.status = 'pending'
  )
  or (select public.is_super_admin())
)
with check (
  exists (
    select 1
    from public.orders
    where orders.id = order_addons.order_id
      and orders.buyer_id = (select auth.uid())
      and orders.status = 'pending'
  )
  or (select public.is_super_admin())
);

create policy "order_addons_delete_own_pending_order"
on public.order_addons
for delete
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_addons.order_id
      and orders.buyer_id = (select auth.uid())
      and orders.status = 'pending'
  )
  or (select public.is_super_admin())
);

-- Super admin sobre las tablas existentes del core.
create policy "events_super_admin_all"
on public.events
for all
to authenticated
using ((select public.is_super_admin()))
with check ((select public.is_super_admin()));

create policy "ticket_tiers_super_admin_all"
on public.ticket_tiers
for all
to authenticated
using ((select public.is_super_admin()))
with check ((select public.is_super_admin()));

create policy "tickets_super_admin_all"
on public.tickets
for all
to authenticated
using ((select public.is_super_admin()))
with check ((select public.is_super_admin()));
