-- =============================================================================
-- P6: break events <-> event_staff_assignments RLS recursion
-- =============================================================================

-- Idempotent guard so this file also applies on databases where P4 is missing.
alter table public.event_staff_assignments
  add column if not exists is_active boolean not null default true,
  add column if not exists expires_at timestamptz;

create or replace function public.has_active_event_assignment(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_staff_assignments as esa
    where esa.event_id = p_event_id
      and esa.user_id = p_user_id
      and esa.is_active = true
      and (esa.expires_at is null or esa.expires_at > now())
  );
$$;

revoke all on function public.has_active_event_assignment(uuid, uuid)
  from public, anon;
grant execute on function public.has_active_event_assignment(uuid, uuid)
  to authenticated, service_role;

-- Previously this policy queried event_staff_assignments directly. Its SELECT
-- policy queried events again, producing PostgreSQL error 42P17.
drop policy if exists events_select_staff_assigned on public.events;
create policy events_select_staff_assigned
on public.events
for select
to authenticated
using (
  public.has_active_event_assignment(events.id, (select auth.uid()))
);

-- Remove the reverse direct lookup too. owns_event is SECURITY DEFINER and
-- therefore evaluates ownership without re-entering events RLS.
drop policy if exists event_staff_select_own_or_organizer
  on public.event_staff_assignments;
create policy event_staff_select_own_or_organizer
on public.event_staff_assignments
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.owns_event(event_id)
  or public.is_super_admin()
);

drop policy if exists event_staff_insert_organizer
  on public.event_staff_assignments;
create policy event_staff_insert_organizer
on public.event_staff_assignments
for insert
to authenticated
with check (
  public.owns_event(event_id)
  or public.is_super_admin()
);

drop policy if exists event_staff_update_organizer
  on public.event_staff_assignments;
create policy event_staff_update_organizer
on public.event_staff_assignments
for update
to authenticated
using (
  public.owns_event(event_id)
  or public.is_super_admin()
)
with check (
  public.owns_event(event_id)
  or public.is_super_admin()
);

drop policy if exists event_staff_delete_organizer
  on public.event_staff_assignments;
create policy event_staff_delete_organizer
on public.event_staff_assignments
for delete
to authenticated
using (
  public.owns_event(event_id)
  or public.is_super_admin()
);

-- profiles -> events was another RLS re-entry path, reached whenever a query
-- embeds the organizer profile (e.g. the public catalog).
create or replace function public.organizer_owns_ticket_holder(
  p_profile_id uuid,
  p_organizer_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.owner_id = p_profile_id
      and e.organizer_id = p_organizer_id
  );
$$;

revoke all on function public.organizer_owns_ticket_holder(uuid, uuid)
  from public, anon;
grant execute on function public.organizer_owns_ticket_holder(uuid, uuid)
  to authenticated, service_role;

drop policy if exists "profiles_select_event_ticket_holders" on public.profiles;
create policy "profiles_select_event_ticket_holders"
on public.profiles
for select
to authenticated
using (
  public.organizer_owns_ticket_holder(profiles.id, (select auth.uid()))
  or (select public.is_super_admin())
);
