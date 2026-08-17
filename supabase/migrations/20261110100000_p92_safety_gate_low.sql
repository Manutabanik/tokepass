-- =============================================================================
-- P92 - Safety Gate low: orders purge index, seating WAL, RLS re-assert
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B3: composite index for buyer + status (purge / buyer order lookups)
-- -----------------------------------------------------------------------------
create index if not exists idx_orders_buyer_status
  on public.orders (buyer_id, status);

comment on index public.idx_orders_buyer_status is
  'Acelera listados y purga de ordenes por comprador y estado (pending/expired).';

-- -----------------------------------------------------------------------------
-- B4: replica identity DEFAULT on event_seating_units
-- Occupancy replica (event_seating_occupancy) is the public realtime source.
-- FULL identity would inflate WAL on mass live seating updates.
-- -----------------------------------------------------------------------------
alter table public.event_seating_units replica identity default;

comment on table public.event_seating_units is
  'Unidades de asiento. Replica identity DEFAULT (no FULL) para limitar WAL en eventos masivos.';

-- -----------------------------------------------------------------------------
-- B1: re-assert orders RLS — read own or super_admin; writes only pending own
-- -----------------------------------------------------------------------------
alter table public.orders enable row level security;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
on public.orders
for select
to authenticated
using (
  buyer_id = (select auth.uid())
  or (select public.is_super_admin())
);

drop policy if exists "orders_insert_own_pending" on public.orders;
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

drop policy if exists "orders_update_own_pending" on public.orders;
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

drop policy if exists "orders_delete_own_pending" on public.orders;
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

comment on policy "orders_select_own" on public.orders is
  'SELECT limitado a buyer_id = auth.uid() o super_admin.';

-- -----------------------------------------------------------------------------
-- B1: re-assert payout_requests RLS — read own or super_admin; insert pending only
-- -----------------------------------------------------------------------------
alter table public.payout_requests enable row level security;

revoke all on public.payout_requests from public, anon;
grant select, insert on public.payout_requests to authenticated;
grant all on public.payout_requests to service_role;

drop policy if exists payout_requests_select_own_or_super on public.payout_requests;
create policy payout_requests_select_own_or_super
  on public.payout_requests
  for select
  to authenticated
  using (
    organizer_id = (select auth.uid())
    or (select public.is_super_admin())
  );

drop policy if exists payout_requests_insert_own on public.payout_requests;
create policy payout_requests_insert_own
  on public.payout_requests
  for insert
  to authenticated
  with check (
    organizer_id = (select auth.uid())
    and status = 'pending'::public.payout_request_status
    and (
      public.is_approved_organizer((select auth.uid()))
      or public.is_super_admin()
    )
  );

drop policy if exists payout_requests_update_super on public.payout_requests;
create policy payout_requests_update_super
  on public.payout_requests
  for update
  to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

comment on policy payout_requests_select_own_or_super on public.payout_requests is
  'SELECT limitado a organizer_id = auth.uid() o super_admin.';

comment on policy payout_requests_insert_own on public.payout_requests is
  'INSERT solo en estado pending, a nombre del organizador autenticado.';
