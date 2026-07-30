-- =============================================================================
-- P2: venues enrichment, settlements ledger, organizer approval gate
-- =============================================================================

-- Venues: city + zone blueprint for organizer CRUD
alter table public.venues
  add column if not exists city text,
  add column if not exists zone_blueprint jsonb not null default '[]'::jsonb;

comment on column public.venues.zone_blueprint is
  'Plantilla de zonas [{name, type, capacity}] reutilizable al crear eventos.';

-- Settlements / liquidaciones historial
create table if not exists public.organizer_settlements (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  gross_amount numeric(14, 2) not null check (gross_amount >= 0),
  platform_fee numeric(14, 2) not null check (platform_fee >= 0),
  net_amount numeric(14, 2) not null check (net_amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  period_label text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizer_settlements_organizer_idx
  on public.organizer_settlements (organizer_id, created_at desc);

alter table public.organizer_settlements enable row level security;

revoke all on public.organizer_settlements from public, anon;
grant select on public.organizer_settlements to authenticated;
grant all on public.organizer_settlements to service_role;

drop policy if exists settlements_select_own on public.organizer_settlements;
create policy settlements_select_own
on public.organizer_settlements
for select
to authenticated
using (
  organizer_id = (select auth.uid())
  or public.is_super_admin()
);

-- Only service_role / superadmin tooling inserts settlements (no client insert).
drop policy if exists settlements_insert_super_admin on public.organizer_settlements;
create policy settlements_insert_super_admin
on public.organizer_settlements
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists settlements_update_super_admin on public.organizer_settlements;
create policy settlements_update_super_admin
on public.organizer_settlements
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- Organizer approval status (signup no longer grants immediate admin)
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'organizer_approval_status'
  ) then
    create type public.organizer_approval_status as enum (
      'none',
      'pending',
      'approved',
      'rejected'
    );
  end if;
end $$;

alter table public.profiles
  add column if not exists organizer_approval_status
    public.organizer_approval_status not null default 'none';

-- Existing admins are treated as approved organizers.
update public.profiles
set organizer_approval_status = 'approved'::public.organizer_approval_status
where role::text in ('admin', 'super_admin')
  and organizer_approval_status = 'none'::public.organizer_approval_status;

-- Finance snapshot for organizer dashboard
create or replace function public.get_organizer_finance_summary(p_organizer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gross numeric(14, 2) := 0;
  v_fees numeric(14, 2) := 0;
  v_net numeric(14, 2) := 0;
  v_mp numeric(14, 2) := 0;
  v_pos numeric(14, 2) := 0;
  v_settled numeric(14, 2) := 0;
  v_pending_settlement numeric(14, 2) := 0;
  v_available numeric(14, 2) := 0;
  v_settlements jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with paid_orders as (
    select distinct o.id, o.total_amount, o.service_charge, o.subtotal, o.payment_method
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
  )
  select
    coalesce(sum(total_amount), 0),
    coalesce(sum(service_charge), 0),
    coalesce(sum(subtotal), 0),
    coalesce(sum(case when payment_method = 'mercadopago' then total_amount else 0 end), 0),
    coalesce(sum(case when payment_method in ('cash_pos', 'transfer_pos') then total_amount else 0 end), 0)
  into v_gross, v_fees, v_net, v_mp, v_pos
  from paid_orders;

  select coalesce(sum(net_amount), 0)
    into v_settled
  from public.organizer_settlements
  where organizer_id = p_organizer_id
    and status = 'completed';

  select coalesce(sum(net_amount), 0)
    into v_pending_settlement
  from public.organizer_settlements
  where organizer_id = p_organizer_id
    and status = 'pending';

  v_available := greatest(0, v_net - v_settled - v_pending_settlement);

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'grossAmount', s.gross_amount,
          'platformFee', s.platform_fee,
          'netAmount', s.net_amount,
          'status', s.status,
          'periodLabel', s.period_label,
          'notes', s.notes,
          'completedAt', s.completed_at,
          'createdAt', s.created_at
        )
        order by s.created_at desc
      )
      from (
        select *
        from public.organizer_settlements
        where organizer_id = p_organizer_id
        order by created_at desc
        limit 50
      ) as s
    ),
    '[]'::jsonb
  )
  into v_settlements;

  return jsonb_build_object(
    'grossRevenue', v_gross,
    'platformFees', v_fees,
    'netRevenue', v_net,
    'mercadopagoGross', v_mp,
    'posGross', v_pos,
    'settledNet', v_settled,
    'pendingSettlementNet', v_pending_settlement,
    'availableToSettle', v_available,
    'settlements', v_settlements
  );
end;
$$;

revoke all on function public.get_organizer_finance_summary(uuid) from public;
grant execute on function public.get_organizer_finance_summary(uuid)
  to authenticated, service_role;
