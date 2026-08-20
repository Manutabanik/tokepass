-- =============================================================================
-- P132 · Caja contable de produccion
-- Excluye ordenes de prueba y eventos no publicados (draft / revision).
-- No modifica montos ni estados de compras reales ya liquidadas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) environment + backfill de banderas de prueba (sin tocar ordenes reales)
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists environment text not null default 'production';

alter table public.orders
  drop constraint if exists orders_environment_check;

alter table public.orders
  add constraint orders_environment_check
  check (environment in ('production', 'test'));

comment on column public.orders.environment is
  'production = dinero real. test = preview, sandbox, POS sobre evento no publicado.';

create index if not exists orders_environment_test_idx
  on public.orders (environment)
  where environment = 'test';

update public.tickets as t
set
  is_test = true,
  updated_at = now()
from public.events as e
where e.id = t.event_id
  and coalesce(t.is_test, false) = false
  and e.status in (
    'draft'::public.event_status,
    'pending_approval'::public.event_status,
    'needs_revision'::public.event_status,
    'rejected'::public.event_status
  );

update public.orders as o
set is_test = true
where coalesce(o.is_test, false) = false
  and (
    o.payment_method = 'test_sandbox'
    or o.payment_provider = 'sandbox'
    or o.mp_payment_id like 'sandbox:%'
    or exists (
      select 1
      from public.tickets as t
      where t.order_id = o.id
        and coalesce(t.is_test, false) = true
    )
    or exists (
      select 1
      from public.tickets as t
      join public.events as e on e.id = t.event_id
      where t.order_id = o.id
        and e.status in (
          'draft'::public.event_status,
          'pending_approval'::public.event_status,
          'needs_revision'::public.event_status,
          'rejected'::public.event_status
        )
    )
  );

update public.orders
set environment = 'test'
where coalesce(is_test, false) = true
  and environment is distinct from 'test';

-- ---------------------------------------------------------------------------
-- 2) Triggers: forzar is_test + environment en ventas no publicadas
-- ---------------------------------------------------------------------------
create or replace function public.is_sandbox_event_status(
  p_status public.event_status
)
returns boolean
language sql
immutable
as $$
  select p_status in (
    'draft'::public.event_status,
    'pending_approval'::public.event_status,
    'needs_revision'::public.event_status,
    'rejected'::public.event_status
  );
$$;

comment on function public.is_sandbox_event_status(public.event_status) is
  'Estados en los que una venta no es dinero real (borrador / revision).';

revoke all on function public.is_sandbox_event_status(public.event_status)
  from public;
grant execute on function public.is_sandbox_event_status(public.event_status)
  to authenticated, service_role;

create or replace function public.tickets_force_is_test_on_draft()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.event_status;
begin
  select e.status
    into v_status
  from public.events as e
  where e.id = new.event_id;

  if public.is_sandbox_event_status(v_status) then
    new.is_test := true;
  elsif new.is_test is null then
    new.is_test := false;
  end if;

  return new;
end;
$$;

create or replace function public.orders_sync_environment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(new.is_test, false)
     or new.environment = 'test' then
    new.is_test := true;
    new.environment := 'test';
  else
    new.environment := coalesce(nullif(btrim(new.environment), ''), 'production');
    if new.environment not in ('production', 'test') then
      new.environment := 'production';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_sync_environment_trg on public.orders;
create trigger orders_sync_environment_trg
before insert or update of is_test, environment
on public.orders
for each row
execute function public.orders_sync_environment();

create or replace function public.tickets_propagate_is_test_to_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.order_id is not null and coalesce(new.is_test, false) then
    update public.orders
    set
      is_test = true,
      environment = 'test',
      updated_at = now()
    where id = new.order_id
      and (
        coalesce(is_test, false) = false
        or environment is distinct from 'test'
      );
  end if;
  return new;
end;
$$;

create or replace function public.mark_order_test_sandbox(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.orders
  set
    payment_method = 'test_sandbox',
    payment_provider = 'sandbox',
    is_test = true,
    environment = 'test',
    updated_at = now()
  where id = p_order_id
    and status = 'paid';

  if not found then
    return false;
  end if;

  update public.tickets
  set
    is_test = true,
    updated_at = now()
  where order_id = p_order_id
    and coalesce(is_test, false) = false;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Libro mayor: solo paid + no test + evento publicado/vivo
-- ---------------------------------------------------------------------------
drop function if exists public.organizer_paid_ledger(uuid);
drop function if exists public.organizer_paid_ledger(uuid, boolean);

create function public.organizer_paid_ledger(
  p_organizer_id uuid,
  p_include_test boolean default false
)
returns table (
  gross_revenue numeric(14, 2),
  tokepass_service_charge numeric(14, 2),
  organizer_net_payout numeric(14, 2),
  mp_gross numeric(14, 2),
  pos_gross numeric(14, 2),
  mp_fees numeric(14, 2),
  pos_fees numeric(14, 2)
)
language sql
stable
security invoker
set search_path = ''
as $$
  with paid_orders as (
    select distinct o.id, o.total_amount, o.service_charge, o.payment_method
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
      and (
        coalesce(p_include_test, false)
        or (
          coalesce(o.is_test, false) = false
          and coalesce(o.environment, 'production') is distinct from 'test'
          and coalesce(t.is_test, false) = false
          and not public.is_sandbox_event_status(e.status)
        )
      )
  )
  select
    coalesce(sum(total_amount), 0)::numeric(14, 2),
    coalesce(sum(service_charge), 0)::numeric(14, 2),
    round(
      coalesce(sum(total_amount), 0) - coalesce(sum(service_charge), 0),
      2
    )::numeric(14, 2),
    coalesce(
      sum(case when payment_method = 'mercadopago' then total_amount else 0 end),
      0
    )::numeric(14, 2),
    coalesce(
      sum(
        case
          when payment_method in ('cash_pos', 'transfer_pos', 'card_pos')
            then total_amount
          else 0
        end
      ),
      0
    )::numeric(14, 2),
    coalesce(
      sum(case when payment_method = 'mercadopago' then service_charge else 0 end),
      0
    )::numeric(14, 2),
    coalesce(
      sum(
        case
          when payment_method in ('cash_pos', 'transfer_pos', 'card_pos')
            then service_charge
          else 0
        end
      ),
      0
    )::numeric(14, 2)
  from paid_orders;
$$;

comment on function public.organizer_paid_ledger(uuid, boolean) is
  'Libro mayor. Default: paid AND NOT is_test AND evento no sandbox. p_include_test solo para auditoria.';

revoke all on function public.organizer_paid_ledger(uuid, boolean) from public;
revoke all on function public.organizer_paid_ledger(uuid, boolean) from anon;
revoke all on function public.organizer_paid_ledger(uuid, boolean) from authenticated;

-- ---------------------------------------------------------------------------
-- 4) KPIs del home: misma caja de produccion
-- ---------------------------------------------------------------------------
create or replace function public.get_organizer_metrics(p_organizer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gross_revenue numeric(14, 2) := 0;
  v_tokepass_service_charge numeric(14, 2) := 0;
  v_organizer_net_payout numeric(14, 2) := 0;
  v_tickets_sold integer := 0;
  v_active_events integer := 0;
  v_recent_sales jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin()
     and not public.is_approved_organizer(p_organizer_id) then
    raise exception 'Forbidden: el usuario no es organizador'
      using errcode = '42501';
  end if;

  select
    l.gross_revenue,
    l.tokepass_service_charge,
    l.organizer_net_payout
  into
    v_gross_revenue,
    v_tokepass_service_charge,
    v_organizer_net_payout
  from public.organizer_paid_ledger(p_organizer_id, false) as l;

  select coalesce(count(*)::integer, 0)
    into v_tickets_sold
  from public.tickets as t
  join public.events as e on e.id = t.event_id
  join public.orders as o on o.id = t.order_id
  where e.organizer_id = p_organizer_id
    and o.status = 'paid'
    and coalesce(o.is_test, false) = false
    and coalesce(o.environment, 'production') is distinct from 'test'
    and coalesce(t.is_test, false) = false
    and not public.is_sandbox_event_status(e.status)
    and t.status not in (
      'pending_payment'::public.ticket_status,
      'cancelled'::public.ticket_status,
      'revoked'::public.ticket_status
    );

  select coalesce(count(*)::integer, 0)
    into v_active_events
  from public.events as e
  where e.organizer_id = p_organizer_id
    and e.status = 'published'::public.event_status;

  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'date', x.created_at,
          'amount', x.total_amount,
          'status', x.status,
          'buyer_name', x.buyer_name
        )
        order by x.created_at desc
      )
      from (
        select
          o.id,
          o.created_at,
          o.total_amount,
          o.status,
          coalesce(
            nullif(btrim(p.full_name), ''),
            p.email,
            'Comprador'
          ) as buyer_name
        from public.orders as o
        left join public.profiles as p on p.id = o.buyer_id
        where o.status = 'paid'
          and coalesce(o.is_test, false) = false
          and coalesce(o.environment, 'production') is distinct from 'test'
          and exists (
            select 1
            from public.tickets as t
            join public.events as e on e.id = t.event_id
            where t.order_id = o.id
              and e.organizer_id = p_organizer_id
              and coalesce(t.is_test, false) = false
              and not public.is_sandbox_event_status(e.status)
          )
        order by o.created_at desc
        limit 5
      ) as x
    ),
    '[]'::jsonb
  )
    into v_recent_sales;

  return jsonb_build_object(
    'gross_revenue', v_gross_revenue,
    'tokepass_service_charge', v_tokepass_service_charge,
    'organizer_net_payout', v_organizer_net_payout,
    'total_revenue', v_gross_revenue,
    'tickets_sold', v_tickets_sold,
    'active_events', v_active_events,
    'recent_sales', v_recent_sales
  );
end;
$$;

comment on function public.get_organizer_metrics(uuid) is
  'KPIs del organizador. Recaudacion de produccion (sin is_test ni eventos sandbox).';

revoke all on function public.get_organizer_metrics(uuid) from public;
revoke all on function public.get_organizer_metrics(uuid) from anon;
grant execute on function public.get_organizer_metrics(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) Finanzas / retiros: display opcional de prueba, caja siempre produccion
-- ---------------------------------------------------------------------------
drop function if exists public.get_organizer_finance_summary(uuid);
drop function if exists public.get_organizer_finance_summary(uuid, boolean);

create function public.get_organizer_finance_summary(
  p_organizer_id uuid,
  p_include_test boolean default false
)
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
  v_platform_fees numeric(14, 2) := 0;
  v_organizer_net numeric(14, 2) := 0;
  v_prod_mp_gross numeric(14, 2) := 0;
  v_prod_mp_fees numeric(14, 2) := 0;
  v_net_liquidable numeric(14, 2) := 0;
  v_settled numeric(14, 2) := 0;
  v_pending_settlement numeric(14, 2) := 0;
  v_pending_payouts numeric(14, 2) := 0;
  v_completed_payouts numeric(14, 2) := 0;
  v_retained numeric(14, 2) := 0;
  v_available numeric(14, 2) := 0;
  v_has_test boolean := false;
  v_settlements jsonb := '[]'::jsonb;
  v_payouts jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin()
     and not public.is_approved_organizer(p_organizer_id) then
    raise exception 'Forbidden: el usuario no es organizador'
      using errcode = '42501';
  end if;

  select
    l.gross_revenue,
    l.tokepass_service_charge,
    l.organizer_net_payout,
    l.mp_gross,
    l.pos_gross,
    l.mp_fees,
    l.pos_fees
  into
    v_gross,
    v_platform_fees,
    v_organizer_net,
    v_mp_gross,
    v_pos_cash,
    v_mp_fees,
    v_pos_fees
  from public.organizer_paid_ledger(
    p_organizer_id,
    coalesce(p_include_test, false)
  ) as l;

  select
    l.mp_gross,
    l.mp_fees
  into
    v_prod_mp_gross,
    v_prod_mp_fees
  from public.organizer_paid_ledger(p_organizer_id, false) as l;

  v_net_liquidable := round(v_prod_mp_gross - v_prod_mp_fees, 2);

  with future_paid as (
    select distinct o.id, o.total_amount, o.service_charge, o.payment_method
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
      and coalesce(o.is_test, false) = false
      and coalesce(o.environment, 'production') is distinct from 'test'
      and coalesce(t.is_test, false) = false
      and not public.is_sandbox_event_status(e.status)
      and e.date > now()
      and o.payment_method = 'mercadopago'
  )
  select coalesce(sum(total_amount - service_charge), 0)
    into v_retained
  from future_paid;

  select exists (
    select 1
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
      and (
        coalesce(o.is_test, false)
        or o.environment = 'test'
        or coalesce(t.is_test, false)
        or public.is_sandbox_event_status(e.status)
      )
  )
    into v_has_test;

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
    'platformFees', v_platform_fees,
    'mpPlatformFees', v_mp_fees,
    'posPlatformFees', v_pos_fees,
    'netRevenue', v_organizer_net,
    'gross_revenue', v_gross,
    'tokepass_service_charge', v_platform_fees,
    'organizer_net_payout', v_organizer_net,
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
    'hasTestOrders', v_has_test,
    'includeTest', coalesce(p_include_test, false),
    'settlements', v_settlements,
    'payoutRequests', v_payouts
  );
end;
$$;

comment on function public.get_organizer_finance_summary(uuid, boolean) is
  'Finanzas. Recaudacion puede incluir prueba; Saldo Disponible y retiros usan solo produccion.';

revoke all on function public.get_organizer_finance_summary(uuid, boolean)
  from public;
revoke all on function public.get_organizer_finance_summary(uuid, boolean)
  from anon;
grant execute on function public.get_organizer_finance_summary(uuid, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Liquidaciones por evento: mismas reglas de produccion
-- ---------------------------------------------------------------------------
create or replace function public.sync_event_payouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with paid as (
    select
      t.event_id,
      o.id as order_id,
      o.total_amount,
      o.service_charge
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where o.status = 'paid'
      and coalesce(o.is_test, false) = false
      and coalesce(o.environment, 'production') is distinct from 'test'
      and coalesce(t.is_test, false) = false
      and not public.is_sandbox_event_status(e.status)
  ),
  distinct_orders as (
    select distinct on (event_id, order_id)
      event_id,
      order_id,
      total_amount,
      service_charge
    from paid
    order by event_id, order_id
  ),
  totals as (
    select
      event_id,
      round(coalesce(sum(total_amount), 0), 2) as gross_amount,
      round(coalesce(sum(service_charge), 0), 2) as service_fee_amount
    from distinct_orders
    group by event_id
  ),
  eligible as (
    select
      e.id as event_id,
      e.organizer_id,
      t.gross_amount,
      t.service_fee_amount,
      greatest(0, round(t.gross_amount - t.service_fee_amount, 2)) as net_amount,
      coalesce(e.ends_at, e.date) + interval '3 days' as scheduled_payout_date,
      op.verification_status,
      op.full_name_or_company,
      op.tax_id,
      op.bank_cbu_cvu,
      op.bank_alias
    from public.events as e
    join totals as t on t.event_id = e.id
    left join public.organizer_profiles as op on op.user_id = e.organizer_id
    where e.status::text in ('published', 'paused', 'completed')
      and coalesce(e.ends_at, e.date) < now()
      and t.gross_amount > 0
  ),
  upserted as (
    insert into public.event_payouts (
      event_id,
      organizer_id,
      gross_amount,
      service_fee_amount,
      net_amount,
      payout_status,
      scheduled_payout_date,
      hold_reason,
      bank_holder_snapshot,
      bank_tax_id_snapshot,
      bank_cbu_snapshot,
      bank_alias_snapshot
    )
    select
      el.event_id,
      el.organizer_id,
      el.gross_amount,
      el.service_fee_amount,
      el.net_amount,
      case
        when el.verification_status = 'verified'::public.organizer_bank_verification_status
          then 'pending_approval'::public.event_payout_status
        else 'hold'::public.event_payout_status
      end,
      el.scheduled_payout_date,
      case
        when el.verification_status = 'verified'::public.organizer_bank_verification_status
          then null
        else 'CBU/CUIT pendiente de validación o no coincide con el titular.'
      end,
      el.full_name_or_company,
      el.tax_id,
      el.bank_cbu_cvu,
      el.bank_alias
    from eligible as el
    on conflict (event_id) do update
      set
        gross_amount = excluded.gross_amount,
        service_fee_amount = excluded.service_fee_amount,
        net_amount = excluded.net_amount,
        scheduled_payout_date = excluded.scheduled_payout_date,
        bank_holder_snapshot = excluded.bank_holder_snapshot,
        bank_tax_id_snapshot = excluded.bank_tax_id_snapshot,
        bank_cbu_snapshot = excluded.bank_cbu_snapshot,
        bank_alias_snapshot = excluded.bank_alias_snapshot,
        payout_status = case
          when public.event_payouts.payout_status in (
            'completed'::public.event_payout_status,
            'cancelled'::public.event_payout_status,
            'processing'::public.event_payout_status
          ) then public.event_payouts.payout_status
          when public.event_payouts.payout_status = 'hold'::public.event_payout_status
            and public.event_payouts.hold_reason
              = 'CBU/CUIT pendiente de validación o no coincide con el titular.'
            and excluded.payout_status = 'pending_approval'::public.event_payout_status
            then 'pending_approval'::public.event_payout_status
          else public.event_payouts.payout_status
        end,
        hold_reason = case
          when public.event_payouts.payout_status in (
            'completed'::public.event_payout_status,
            'cancelled'::public.event_payout_status
          ) then public.event_payouts.hold_reason
          when public.event_payouts.payout_status = 'hold'::public.event_payout_status
            and public.event_payouts.hold_reason
              = 'CBU/CUIT pendiente de validación o no coincide con el titular.'
            and excluded.payout_status = 'pending_approval'::public.event_payout_status
            then null
          else public.event_payouts.hold_reason
        end
    returning 1
  )
  select count(*) into v_count from upserted;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.sync_event_payouts() from public;
grant execute on function public.sync_event_payouts() to authenticated, service_role;
