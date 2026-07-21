-- =============================================================================
-- Tokepass · Listas Digitales, Cortesías y FreePass
-- Nota: 00010 ya existe (service_charge). Este archivo es 00011.
-- =============================================================================

create table if not exists public.guest_lists (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  max_guests integer not null check (max_guests > 0),
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_lists_event_name_key unique (event_id, name)
);

create table if not exists public.guest_list_entries (
  id uuid primary key default gen_random_uuid(),
  guest_list_id uuid not null references public.guest_lists(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'checked_in')),
  ticket_id uuid references public.tickets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guest_lists_event_id_idx
  on public.guest_lists (event_id);

create index if not exists guest_list_entries_list_id_idx
  on public.guest_list_entries (guest_list_id);

create index if not exists guest_list_entries_ticket_id_idx
  on public.guest_list_entries (ticket_id)
  where ticket_id is not null;

create index if not exists guest_list_entries_status_idx
  on public.guest_list_entries (guest_list_id, status);

create trigger guest_lists_set_updated_at
before update on public.guest_lists
for each row execute function public.set_updated_at();

create trigger guest_list_entries_set_updated_at
before update on public.guest_list_entries
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.guest_lists enable row level security;
alter table public.guest_list_entries enable row level security;

create policy "guest_lists_select_owner_or_super_admin"
on public.guest_lists
for select
to authenticated
using (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

create policy "guest_lists_insert_owner_or_super_admin"
on public.guest_lists
for insert
to authenticated
with check (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

create policy "guest_lists_update_owner_or_super_admin"
on public.guest_lists
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

create policy "guest_lists_delete_owner_or_super_admin"
on public.guest_lists
for delete
to authenticated
using (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

create policy "guest_list_entries_select_owner_or_super_admin"
on public.guest_list_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.guest_lists as gl
    where gl.id = guest_list_entries.guest_list_id
      and (
        (select public.owns_event(gl.event_id))
        or (select public.is_super_admin())
      )
  )
);

create policy "guest_list_entries_manage_owner_or_super_admin"
on public.guest_list_entries
for all
to authenticated
using (
  exists (
    select 1
    from public.guest_lists as gl
    where gl.id = guest_list_entries.guest_list_id
      and (
        (select public.owns_event(gl.event_id))
        or (select public.is_super_admin())
      )
  )
)
with check (
  exists (
    select 1
    from public.guest_lists as gl
    where gl.id = guest_list_entries.guest_list_id
      and (
        (select public.owns_event(gl.event_id))
        or (select public.is_super_admin())
      )
  )
);

-- Lectura pública mínima de meta de lista (claim landing) vía RPC security definer

-- -----------------------------------------------------------------------------
-- Tier interno FreePass por evento
-- -----------------------------------------------------------------------------

create or replace function public.ensure_freepass_tier(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier_id uuid;
begin
  select tt.id
    into v_tier_id
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.name = 'Cortesía / FreePass'
  limit 1;

  if v_tier_id is not null then
    return v_tier_id;
  end if;

  insert into public.ticket_tiers (
    event_id,
    name,
    price,
    capacity,
    sold,
    bonus_reward
  )
  values (
    p_event_id,
    'Cortesía / FreePass',
    0,
    100000,
    0,
    'CORTESÍA / FREEPASS'
  )
  returning id into v_tier_id;

  return v_tier_id;
end;
$$;

revoke all on function public.ensure_freepass_tier(uuid) from public;
grant execute on function public.ensure_freepass_tier(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Registro público atómico (anti-overbooking)
-- -----------------------------------------------------------------------------

create or replace function public.register_guest_list_entry(
  p_list_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_count integer;
  v_entry_id uuid;
  v_name text;
begin
  v_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_name is null then
    raise exception 'El nombre es obligatorio' using errcode = '22023';
  end if;

  select gl.max_guests
    into v_max
  from public.guest_lists as gl
  where gl.id = p_list_id
  for update;

  if v_max is null then
    raise exception 'Lista no encontrada' using errcode = 'P0002';
  end if;

  select count(*)::integer
    into v_count
  from public.guest_list_entries as e
  where e.guest_list_id = p_list_id;

  if v_count >= v_max then
    raise exception 'Lista completa: no quedan cupos'
      using errcode = 'P0001';
  end if;

  insert into public.guest_list_entries (
    guest_list_id,
    full_name,
    email,
    phone,
    status
  )
  values (
    p_list_id,
    v_name,
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    'pending'
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

revoke all on function public.register_guest_list_entry(uuid, text, text, text) from public;
grant execute on function public.register_guest_list_entry(uuid, text, text, text)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Claim FreePass → ticket $0 Living Ticket
-- -----------------------------------------------------------------------------

create or replace function public.claim_guest_list_entry(
  p_entry_id uuid,
  p_owner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.guest_list_entries%rowtype;
  v_list public.guest_lists%rowtype;
  v_tier_id uuid;
  v_ticket_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_entry
  from public.guest_list_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Entrada no encontrada' using errcode = 'P0002';
  end if;

  if v_entry.status = 'checked_in' then
    raise exception 'Esta cortesía ya fue usada en puerta' using errcode = '23514';
  end if;

  if v_entry.status = 'claimed' and v_entry.ticket_id is not null then
    return v_entry.ticket_id;
  end if;

  if v_entry.status <> 'pending' then
    raise exception 'La entrada no está disponible para canje' using errcode = '23514';
  end if;

  select *
    into v_list
  from public.guest_lists
  where id = v_entry.guest_list_id
  for update;

  if v_list.valid_until < now() then
    raise exception 'El horario de esta lista ya venció' using errcode = '23514';
  end if;

  v_tier_id := public.ensure_freepass_tier(v_list.event_id);

  update public.ticket_tiers
  set sold = sold + 1
  where id = v_tier_id
    and sold < capacity;

  if not found then
    update public.ticket_tiers
    set
      capacity = capacity + 1000,
      sold = sold + 1
    where id = v_tier_id;
  end if;

  insert into public.tickets (
    event_id,
    tier_id,
    owner_id,
    qr_code,
    status,
    is_dynamic_qr
  )
  values (
    v_list.event_id,
    v_tier_id,
    p_owner_id,
    'freepass-' || replace(gen_random_uuid()::text, '-', ''),
    'valid'::public.ticket_status,
    true
  )
  returning id into v_ticket_id;

  update public.guest_list_entries
  set
    status = 'claimed',
    ticket_id = v_ticket_id
  where id = p_entry_id;

  return v_ticket_id;
end;
$$;

revoke all on function public.claim_guest_list_entry(uuid, uuid) from public;
grant execute on function public.claim_guest_list_entry(uuid, uuid)
  to authenticated, service_role;

-- Meta pública de lista (sin filtrar PII)
create or replace function public.get_guest_list_public(p_list_id uuid)
returns table (
  id uuid,
  name text,
  max_guests integer,
  used_guests integer,
  remaining integer,
  valid_until timestamptz,
  event_id uuid,
  event_title text,
  event_date timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gl.id,
    gl.name,
    gl.max_guests,
    (
      select count(*)::integer
      from public.guest_list_entries as e
      where e.guest_list_id = gl.id
    ) as used_guests,
    greatest(
      0,
      gl.max_guests - (
        select count(*)::integer
        from public.guest_list_entries as e
        where e.guest_list_id = gl.id
      )
    ) as remaining,
    gl.valid_until,
    e.id as event_id,
    e.title as event_title,
    e.date as event_date
  from public.guest_lists as gl
  join public.events as e on e.id = gl.event_id
  where gl.id = p_list_id;
$$;

revoke all on function public.get_guest_list_public(uuid) from public;
grant execute on function public.get_guest_list_public(uuid)
  to anon, authenticated, service_role;

-- Al escanear ticket FreePass, marcar entry como checked_in
create or replace function public.mark_guest_entry_checked_in(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.guest_list_entries
  set status = 'checked_in'
  where ticket_id = p_ticket_id
    and status in ('claimed', 'pending');
end;
$$;

revoke all on function public.mark_guest_entry_checked_in(uuid) from public;
grant execute on function public.mark_guest_entry_checked_in(uuid)
  to authenticated, service_role;
