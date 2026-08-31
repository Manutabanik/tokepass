-- p196 · El titular puede leer el evento/tier de SUS entradas aunque el
-- evento siga en borrador. Sin esto, Mis entradas y el comprobante dan 404
-- en compras sandbox.

drop policy if exists events_select_as_ticket_holder on public.events;
create policy events_select_as_ticket_holder
on public.events
for select
to authenticated
using (
  exists (
    select 1
    from public.tickets as t
    where t.event_id = events.id
      and t.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    where t.event_id = events.id
      and o.buyer_id = (select auth.uid())
  )
);

drop policy if exists ticket_tiers_select_as_ticket_holder on public.ticket_tiers;
create policy ticket_tiers_select_as_ticket_holder
on public.ticket_tiers
for select
to authenticated
using (
  exists (
    select 1
    from public.tickets as t
    where t.tier_id = ticket_tiers.id
      and t.owner_id = (select auth.uid())
  )
);

drop policy if exists venues_select_as_ticket_holder on public.venues;
create policy venues_select_as_ticket_holder
on public.venues
for select
to authenticated
using (
  exists (
    select 1
    from public.events as e
    join public.tickets as t on t.event_id = e.id
    where e.venue_id = venues.id
      and t.owner_id = (select auth.uid())
  )
);

create index if not exists tickets_owner_event_id_idx
  on public.tickets (owner_id, event_id);

create index if not exists tickets_tier_owner_id_idx
  on public.tickets (tier_id, owner_id);

comment on policy events_select_as_ticket_holder on public.events is
  'El comprador ve el evento de sus tickets/ordenes, incluso en draft/sandbox.';
