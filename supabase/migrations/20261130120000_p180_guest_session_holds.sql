-- P180: holds de invitado por session_id (owner_id puede ser un UUID de carrito,
-- no un auth.users). RLS de lectura propia + trigger de user_session_id.

alter table public.event_ga_cart_holds
  add column if not exists user_session_id text;

update public.event_ga_cart_holds
set user_session_id = owner_id::text
where user_session_id is null
   or btrim(user_session_id) = '';

alter table public.event_ga_cart_holds
  alter column user_session_id set default '';

update public.event_ga_cart_holds
set user_session_id = owner_id::text
where btrim(coalesce(user_session_id, '')) = '';

alter table public.event_ga_cart_holds
  alter column user_session_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_ga_cart_holds_session_check'
  ) then
    alter table public.event_ga_cart_holds
      add constraint event_ga_cart_holds_session_check
      check (btrim(user_session_id) <> '');
  end if;
end
$$;

create index if not exists event_ga_cart_holds_session_idx
  on public.event_ga_cart_holds (user_session_id, event_id);

create or replace function public.sync_ga_hold_session_id()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.user_session_id is null or btrim(new.user_session_id) = '' then
    new.user_session_id := new.owner_id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists event_ga_cart_holds_sync_session on public.event_ga_cart_holds;
create trigger event_ga_cart_holds_sync_session
before insert or update on public.event_ga_cart_holds
for each row execute function public.sync_ga_hold_session_id();

-- Escrituras de invitado: solo service_role (server actions + RPCs).
-- No se otorga INSERT/UPDATE a anon: cualquiera podría agotar o robar holds.
revoke insert, update, delete on table public.event_ga_cart_holds from anon, authenticated;
revoke insert, update, delete on table public.seat_holds from anon, authenticated;
grant select on table public.event_ga_cart_holds to authenticated;
grant select on table public.seat_holds to authenticated, anon;

drop policy if exists event_ga_cart_holds_select_session on public.event_ga_cart_holds;
create policy event_ga_cart_holds_select_session
  on public.event_ga_cart_holds
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or user_session_id = (select auth.uid())::text
  );

drop policy if exists seat_holds_select_session_anon on public.seat_holds;
create policy seat_holds_select_session_anon
  on public.seat_holds
  for select
  to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or (
      (select auth.uid()) is not null
      and user_session_id = (select auth.uid())::text
    )
  );

create or replace function public.transfer_guest_cart_holds(
  p_event_id uuid,
  p_session_id uuid,
  p_buyer_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_event_id is null or p_session_id is null or p_buyer_id is null then
    return;
  end if;
  if p_session_id = p_buyer_id then
    return;
  end if;

  insert into public.event_ga_cart_holds (
    event_id,
    tier_id,
    owner_id,
    quantity,
    reserved_until,
    user_session_id
  )
  select
    h.event_id,
    h.tier_id,
    p_buyer_id,
    h.quantity,
    h.reserved_until,
    p_session_id::text
  from public.event_ga_cart_holds as h
  where h.event_id = p_event_id
    and h.owner_id = p_session_id
  on conflict (event_id, owner_id, tier_id)
  do update set
    quantity = public.event_ga_cart_holds.quantity + excluded.quantity,
    reserved_until = greatest(
      public.event_ga_cart_holds.reserved_until,
      excluded.reserved_until
    ),
    user_session_id = excluded.user_session_id;

  delete from public.event_ga_cart_holds
  where event_id = p_event_id
    and owner_id = p_session_id;

  update public.seat_holds
  set owner_id = p_buyer_id
  where event_id = p_event_id
    and (
      owner_id = p_session_id
      or user_session_id = p_session_id::text
    );

  update public.event_seating_units
  set reserved_by = p_buyer_id
  where event_id = p_event_id
    and reserved_by = p_session_id;
end;
$$;

revoke all on function public.transfer_guest_cart_holds(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_guest_cart_holds(uuid, uuid, uuid)
  to service_role;

comment on function public.transfer_guest_cart_holds(uuid, uuid, uuid) is
  'Pasa holds de un UUID de carrito invitado al buyer_id real antes de reservar.';

comment on column public.event_ga_cart_holds.user_session_id is
  'Session de carrito (UUID). En invitado coincide con owner_id y no es auth.users.';

comment on column public.seat_holds.owner_id is
  'Usuario autenticado o UUID de carrito invitado. Null solo si el session no es UUID.';
