-- =============================================================================
-- P197: break events <-> tickets RLS recursion (42P17)
-- =============================================================================
-- P196 added events_select_as_ticket_holder with a direct EXISTS on tickets.
-- tickets_select_organized_event then SELECTs events, which re-enters the
-- ticket-holder policy and PostgreSQL raises 42P17 (infinite recursion).
-- Same cycle: venues_select_as_ticket_holder → events → tickets → events.

create or replace function public.buyer_can_read_event(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id is not null
    and (
      exists (
        select 1
        from public.tickets as t
        where t.event_id = p_event_id
          and t.owner_id = p_user_id
      )
      or exists (
        select 1
        from public.orders as o
        join public.tickets as t on t.order_id = o.id
        where t.event_id = p_event_id
          and o.buyer_id = p_user_id
      )
    );
$$;

create or replace function public.buyer_can_read_ticket_tier(
  p_tier_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id is not null
    and exists (
      select 1
      from public.tickets as t
      where t.tier_id = p_tier_id
        and t.owner_id = p_user_id
    );
$$;

create or replace function public.buyer_can_read_venue(
  p_venue_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id is not null
    and exists (
      select 1
      from public.tickets as t
      join public.events as e on e.id = t.event_id
      where e.venue_id = p_venue_id
        and t.owner_id = p_user_id
    );
$$;

revoke all on function public.buyer_can_read_event(uuid, uuid)
  from public, anon;
grant execute on function public.buyer_can_read_event(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.buyer_can_read_ticket_tier(uuid, uuid)
  from public, anon;
grant execute on function public.buyer_can_read_ticket_tier(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.buyer_can_read_venue(uuid, uuid)
  from public, anon;
grant execute on function public.buyer_can_read_venue(uuid, uuid)
  to authenticated, service_role;

drop policy if exists events_select_as_ticket_holder on public.events;
create policy events_select_as_ticket_holder
on public.events
for select
to authenticated
using (
  public.buyer_can_read_event(events.id, (select auth.uid()))
);

drop policy if exists ticket_tiers_select_as_ticket_holder on public.ticket_tiers;
create policy ticket_tiers_select_as_ticket_holder
on public.ticket_tiers
for select
to authenticated
using (
  public.buyer_can_read_ticket_tier(ticket_tiers.id, (select auth.uid()))
);

drop policy if exists venues_select_as_ticket_holder on public.venues;
create policy venues_select_as_ticket_holder
on public.venues
for select
to authenticated
using (
  public.buyer_can_read_venue(venues.id, (select auth.uid()))
);

-- Close the other half of the cycle: organizer ticket reads no longer
-- re-enter events RLS.
drop policy if exists "tickets_select_organized_event" on public.tickets;
create policy "tickets_select_organized_event"
on public.tickets
for select
to authenticated
using (public.owns_event(event_id));

comment on function public.buyer_can_read_event(uuid, uuid) is
  'SECURITY DEFINER: el titular lee su evento (incluso draft) sin reentrar RLS de events/tickets.';

comment on policy events_select_as_ticket_holder on public.events is
  'El comprador ve el evento de sus tickets/ordenes, incluso en draft/sandbox. Sin JOIN RLS.';
