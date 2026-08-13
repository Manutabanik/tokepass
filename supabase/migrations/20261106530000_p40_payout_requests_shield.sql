-- =============================================================================
-- P40: Escudo financiero — payout_requests + retención pre-evento
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'payout_request_status'
  ) then
    create type public.payout_request_status as enum (
      'pending',
      'processing',
      'completed',
      'rejected'
    );
  end if;
end
$$;

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  amount numeric(14, 2) not null
    check (amount > 0),
  status public.payout_request_status not null default 'pending',
  cbu_destination varchar(80) not null
    check (char_length(btrim(cbu_destination)) >= 6),
  admin_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payout_requests_organizer_idx
  on public.payout_requests (organizer_id, created_at desc);

create index if not exists payout_requests_status_idx
  on public.payout_requests (status, created_at desc);

comment on table public.payout_requests is
  'Solicitudes de retiro B2B. Solo SuperAdmin completa o rechaza.';

create or replace function public.set_payout_requests_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists payout_requests_set_updated_at on public.payout_requests;
create trigger payout_requests_set_updated_at
  before update on public.payout_requests
  for each row
  execute function public.set_payout_requests_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
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

-- Organizador solo inserta pendientes a su nombre.
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

-- Solo SuperAdmin cambia estado (completed / rejected / processing).
drop policy if exists payout_requests_update_super on public.payout_requests;
create policy payout_requests_update_super
  on public.payout_requests
  for update
  to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- -----------------------------------------------------------------------------
-- Finance summary: retención pre-evento + payout_requests en el saldo
-- -----------------------------------------------------------------------------
create or replace function public.get_organizer_finance_summary(p_organizer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gross numeric(14, 2) := 0;
  v_mp_gross numeric(14, 2) := 0;
  v_pos_cash numeric(14, 2) := 0;
  v_mp_fees numeric(14, 2) := 0;
  v_pos_fees numeric(14, 2) := 0;
  v_net_liquidable numeric(14, 2) := 0;
  v_settled numeric(14, 2) := 0;
  v_pending_settlement numeric(14, 2) := 0;
  v_pending_payouts numeric(14, 2) := 0;
  v_completed_payouts numeric(14, 2) := 0;
  v_retained numeric(14, 2) := 0;
  v_available numeric(14, 2) := 0;
  v_settlements jsonb := '[]'::jsonb;
  v_payouts jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with paid_orders as (
    select distinct o.id, o.total_amount, o.service_charge, o.payment_method
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
  )
  select
    coalesce(sum(total_amount), 0),
    coalesce(sum(case when payment_method = 'mercadopago' then total_amount else 0 end), 0),
    coalesce(sum(case when payment_method in ('cash_pos', 'transfer_pos') then total_amount else 0 end), 0),
    coalesce(sum(case when payment_method = 'mercadopago' then service_charge else 0 end), 0),
    coalesce(sum(case when payment_method in ('cash_pos', 'transfer_pos') then service_charge else 0 end), 0)
  into v_gross, v_mp_gross, v_pos_cash, v_mp_fees, v_pos_fees
  from paid_orders;

  v_net_liquidable := round(v_mp_gross - v_mp_fees, 2);

  -- Retención: neto MP de eventos que todavía no ocurrieron (garantía pre-evento).
  with future_paid as (
    select distinct o.id, o.total_amount, o.service_charge, o.payment_method
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
      and e.date > now()
      and o.payment_method = 'mercadopago'
  )
  select coalesce(sum(total_amount - service_charge), 0)
    into v_retained
  from future_paid;

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

  select coalesce(sum(amount), 0)
    into v_pending_payouts
  from public.payout_requests
  where organizer_id = p_organizer_id
    and status in (
      'pending'::public.payout_request_status,
      'processing'::public.payout_request_status
    );

  select coalesce(sum(amount), 0)
    into v_completed_payouts
  from public.payout_requests
  where organizer_id = p_organizer_id
    and status = 'completed'::public.payout_request_status;

  v_available := greatest(
    0,
    v_net_liquidable
      - v_settled
      - v_completed_payouts
      - v_pending_settlement
      - v_pending_payouts
      - v_retained
  );

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

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'amount', p.amount,
          'status', p.status,
          'cbuDestination', p.cbu_destination,
          'eventId', p.event_id,
          'adminNotes', p.admin_notes,
          'createdAt', p.created_at,
          'updatedAt', p.updated_at,
          'reviewedAt', p.reviewed_at
        )
        order by p.created_at desc
      )
      from (
        select *
        from public.payout_requests
        where organizer_id = p_organizer_id
        order by created_at desc
        limit 50
      ) as p
    ),
    '[]'::jsonb
  )
  into v_payouts;

  return jsonb_build_object(
    'grossRevenue', v_gross,
    'platformFees', v_mp_fees + v_pos_fees,
    'mpPlatformFees', v_mp_fees,
    'posPlatformFees', v_pos_fees,
    'netRevenue', v_net_liquidable,
    'mercadopagoGross', v_mp_gross,
    'posGross', v_pos_cash,
    'mpGrossTotal', v_mp_gross,
    'posCashTotal', v_pos_cash,
    'netLiquidable', v_net_liquidable,
    'settledNet', v_settled + v_completed_payouts,
    'pendingSettlementNet', v_pending_settlement + v_pending_payouts,
    'retainedHeld', v_retained,
    'availableToSettle', v_available,
    'platformFeeDebt', v_pos_fees,
    'settlements', v_settlements,
    'payoutRequests', v_payouts
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Solicitar retiro (atómico)
-- -----------------------------------------------------------------------------
create or replace function public.request_organizer_payout(
  p_amount numeric,
  p_cbu_destination text,
  p_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_summary jsonb;
  v_available numeric(14, 2);
  v_amount numeric(14, 2);
  v_cbu text;
  v_id uuid;
  v_event_ok boolean := true;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  if not public.is_approved_organizer(v_uid) and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  v_cbu := nullif(btrim(coalesce(p_cbu_destination, '')), '');

  if v_amount < 1 then
    raise exception 'El monto mínimo de retiro es $1' using errcode = 'P0001';
  end if;

  if v_cbu is null or char_length(v_cbu) < 6 then
    raise exception 'Ingresá un CBU/CVU o alias válido' using errcode = 'P0001';
  end if;

  if p_event_id is not null then
    select exists (
      select 1
      from public.events as e
      where e.id = p_event_id
        and e.organizer_id = v_uid
    )
    into v_event_ok;

    if not v_event_ok then
      raise exception 'Evento inválido para este retiro' using errcode = 'P0001';
    end if;
  end if;

  v_summary := public.get_organizer_finance_summary(v_uid);
  v_available := coalesce((v_summary ->> 'availableToSettle')::numeric, 0);

  if v_amount > v_available then
    raise exception 'El monto supera el saldo disponible para retiro'
      using errcode = 'P0001';
  end if;

  insert into public.payout_requests (
    organizer_id,
    event_id,
    amount,
    status,
    cbu_destination
  )
  values (
    v_uid,
    p_event_id,
    v_amount,
    'pending'::public.payout_request_status,
    v_cbu
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.request_organizer_payout(numeric, text, uuid) from public;
grant execute on function public.request_organizer_payout(numeric, text, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Completar / rechazar (solo SuperAdmin)
-- -----------------------------------------------------------------------------
create or replace function public.complete_organizer_payout(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.payout_requests
  set
    status = 'completed'::public.payout_request_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_payout_id
    and status in (
      'pending'::public.payout_request_status,
      'processing'::public.payout_request_status
    );

  if not found then
    raise exception 'Retiro no encontrado o ya cerrado' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.reject_organizer_payout(
  p_payout_id uuid,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.payout_requests
  set
    status = 'rejected'::public.payout_request_status,
    admin_notes = nullif(btrim(coalesce(p_admin_notes, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_payout_id
    and status in (
      'pending'::public.payout_request_status,
      'processing'::public.payout_request_status
    );

  if not found then
    raise exception 'Retiro no encontrado o ya cerrado' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.complete_organizer_payout(uuid) from public;
revoke all on function public.reject_organizer_payout(uuid, text) from public;
grant execute on function public.complete_organizer_payout(uuid)
  to authenticated, service_role;
grant execute on function public.reject_organizer_payout(uuid, text)
  to authenticated, service_role;
