-- =============================================================================
-- P86 - Libro mayor paid-only para metricas del organizador
-- Depreca el fallback a precio de lista / tickets emitidos de 00006.
-- GMV = SUM(orders.total_amount) WHERE status = 'paid'
-- =============================================================================

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
     and (auth.uid() is null or auth.uid() <> p_organizer_id) then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = p_organizer_id
      and profiles.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Forbidden: el usuario no es organizador'
      using errcode = '42501';
  end if;

  --------------------------------------------------------------------
  -- Libro mayor: solo ordenes liquidadas. Sin fallback a list price.
  --------------------------------------------------------------------
  with paid_orders as (
    select distinct o.id, o.total_amount, o.service_charge
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and o.status = 'paid'
  )
  select
    coalesce(sum(total_amount), 0),
    coalesce(sum(service_charge), 0)
  into v_gross_revenue, v_tokepass_service_charge
  from paid_orders;

  v_organizer_net_payout := round(v_gross_revenue - v_tokepass_service_charge, 2);

  select coalesce(count(*)::integer, 0)
    into v_tickets_sold
  from public.tickets as t
  join public.events as e on e.id = t.event_id
  join public.orders as o on o.id = t.order_id
  where e.organizer_id = p_organizer_id
    and o.status = 'paid'
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
          and exists (
            select 1
            from public.tickets as t
            join public.events as e on e.id = t.event_id
            where t.order_id = o.id
              and e.organizer_id = p_organizer_id
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
  'KPIs del organizador desde el libro mayor paid-only: gross_revenue = SUM(orders.total_amount) WHERE status=paid. Sin fallback a precio de lista.';

revoke all on function public.get_organizer_metrics(uuid) from public;
revoke all on function public.get_organizer_metrics(uuid) from anon;
grant execute on function public.get_organizer_metrics(uuid)
  to authenticated, service_role;

-- Misma fuente de verdad en finanzas: aliases snake_case del ledger.
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
  v_platform_fees numeric(14, 2) := 0;
  v_organizer_net numeric(14, 2) := 0;
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

  v_platform_fees := round(v_mp_fees + v_pos_fees, 2);
  v_organizer_net := round(v_gross - v_platform_fees, 2);
  v_net_liquidable := round(v_mp_gross - v_mp_fees, 2);

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
    'settlements', v_settlements,
    'payoutRequests', v_payouts
  );
end;
$$;

comment on function public.get_organizer_finance_summary(uuid) is
  'Finanzas del organizador. gross_revenue / tokepass_service_charge / organizer_net_payout salen del mismo CTE paid_orders (status=paid).';
