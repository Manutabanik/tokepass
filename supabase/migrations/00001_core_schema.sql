-- =============================================================================
-- Tokepass MVP - Esquema fundacional
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.event_status as enum (
  'draft',
  'published',
  'cancelled',
  'completed'
);

create type public.ticket_status as enum (
  'valid',
  'scanned',
  'revoked'
);

create type public.user_role as enum (
  'customer',
  'admin'
);

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id),
  title text not null,
  description text,
  date timestamptz not null,
  location text not null,
  image_url text,
  status public.event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  capacity integer not null check (capacity >= 0),
  sold integer not null default 0 check (sold >= 0 and sold <= capacity),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  qr_code text not null unique,
  status public.ticket_status not null default 'valid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices para claves foráneas y filtros usados por las políticas RLS.
create index events_organizer_id_idx
  on public.events (organizer_id);

create index events_status_date_idx
  on public.events (status, date);

create index ticket_tiers_event_id_idx
  on public.ticket_tiers (event_id);

create index tickets_owner_id_idx
  on public.tickets (owner_id);

create index tickets_event_id_idx
  on public.tickets (event_id);

create index tickets_tier_id_idx
  on public.tickets (tier_id);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger ticket_tiers_set_updated_at
before update on public.ticket_tiers
for each row execute function public.set_updated_at();

create trigger tickets_set_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Alta automática del perfil al registrar un usuario en Supabase Auth
-- SECURITY DEFINER permite insertar el perfil aunque RLS esté habilitado.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    'customer'::public.user_role
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Reserva atómica de tickets
-- El bloqueo FOR UPDATE serializa las compras concurrentes de un mismo tier.
-- SECURITY DEFINER permite actualizar inventario e insertar tickets sin abrir
-- esas operaciones directamente mediante políticas RLS.
-- -----------------------------------------------------------------------------

create or replace function public.reserve_tickets(
  p_tier_id uuid,
  p_owner_id uuid,
  p_quantity integer
)
returns table (ticket_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_capacity integer;
  v_sold integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero'
      using errcode = '22023';
  end if;

  -- Un cliente autenticado solo puede reservar para sí mismo. El service role
  -- puede hacerlo en nombre de un usuario desde procesos backend confiables.
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  select tt.event_id, tt.capacity, tt.sold
    into v_event_id, v_capacity, v_sold
  from public.ticket_tiers as tt
  join public.events as e on e.id = tt.event_id
  where tt.id = p_tier_id
    and e.status = 'published'::public.event_status
  for update of tt;

  if not found then
    raise exception 'Ticket tier not found or event is not published'
      using errcode = 'P0002';
  end if;

  if (v_capacity - v_sold) < p_quantity then
    raise exception 'Sold out'
      using errcode = 'P0001';
  end if;

  update public.ticket_tiers
  set sold = sold + p_quantity
  where id = p_tier_id;

  return query
  insert into public.tickets (
    event_id,
    tier_id,
    owner_id,
    qr_code
  )
  select
    v_event_id,
    p_tier_id,
    p_owner_id,
    pg_catalog.gen_random_uuid()::text
  from pg_catalog.generate_series(1, p_quantity)
  returning id;
end;
$$;

revoke all on function public.reserve_tickets(uuid, uuid, integer) from public;
revoke all on function public.reserve_tickets(uuid, uuid, integer) from anon;
grant execute on function public.reserve_tickets(uuid, uuid, integer)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Las políticas consultan tablas relacionadas en una sola dirección:
-- ticket_tiers/tickets -> events. Ninguna política de events vuelve a consultar
-- esas tablas, por lo que no existe recursión RLS.
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.ticket_tiers enable row level security;
alter table public.tickets enable row level security;

-- Limita las columnas sensibles aunque una fila supere la política RLS.
-- El email y el rol se administran desde Auth/backend; un usuario solo edita
-- su nombre. Los organizadores solo cambian el estado operativo del ticket.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

revoke update on public.tickets from authenticated;
grant update (status) on public.tickets to authenticated;

-- Profiles: cada usuario solo puede leer y editar su propio perfil.
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Events: los publicados son públicos.
create policy "events_select_published"
on public.events
for select
to anon, authenticated
using (status = 'published'::public.event_status);

-- El organizador también puede leer sus propios eventos no publicados.
create policy "events_select_own"
on public.events
for select
to authenticated
using ((select auth.uid()) = organizer_id);

-- Un usuario autenticado solo puede crear eventos a su propio nombre.
create policy "events_insert_own"
on public.events
for insert
to authenticated
with check ((select auth.uid()) = organizer_id);

-- El organizador puede editar sus eventos y cambiar su estado.
create policy "events_update_own"
on public.events
for update
to authenticated
using ((select auth.uid()) = organizer_id)
with check ((select auth.uid()) = organizer_id);

-- El organizador puede eliminar sus propios eventos.
create policy "events_delete_own"
on public.events
for delete
to authenticated
using ((select auth.uid()) = organizer_id);

-- Ticket tiers: lectura pública únicamente cuando el evento está publicado.
create policy "ticket_tiers_select_published_event"
on public.ticket_tiers
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.status = 'published'::public.event_status
  )
);

-- El organizador puede leer los tiers de todos sus eventos, incluidos drafts.
create policy "ticket_tiers_select_own_event"
on public.ticket_tiers
for select
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.organizer_id = (select auth.uid())
  )
);

create policy "ticket_tiers_insert_own_event"
on public.ticket_tiers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.organizer_id = (select auth.uid())
  )
);

create policy "ticket_tiers_update_own_event"
on public.ticket_tiers
for update
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.organizer_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.organizer_id = (select auth.uid())
  )
);

create policy "ticket_tiers_delete_own_event"
on public.ticket_tiers
for delete
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.organizer_id = (select auth.uid())
  )
);

-- Tickets: los compradores solo pueden ver sus propias entradas.
create policy "tickets_select_own"
on public.tickets
for select
to authenticated
using ((select auth.uid()) = owner_id);

-- Los organizadores pueden consultar las entradas de sus eventos.
create policy "tickets_select_organized_event"
on public.tickets
for select
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = tickets.event_id
      and events.organizer_id = (select auth.uid())
  )
);

-- Los organizadores pueden actualizar entradas, por ejemplo al escanearlas.
create policy "tickets_update_organized_event"
on public.tickets
for update
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = tickets.event_id
      and events.organizer_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.events
    where events.id = tickets.event_id
      and events.organizer_id = (select auth.uid())
  )
);
