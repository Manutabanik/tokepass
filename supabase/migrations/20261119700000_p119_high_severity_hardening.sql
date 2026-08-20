-- =============================================================================
-- Tokepass · P119 · Hallazgos de severidad alta (H-AUTH-1)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- H-AUTH-1: get_organizer_metrics exige organizador aprobado
-- (mismo gate que get_organizer_finance_summary; super_admin / service_role
-- pueden consultar cualquier organizer_id)
-- -----------------------------------------------------------------------------
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
  from public.organizer_paid_ledger(p_organizer_id) as l;

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
  'KPIs del organizador. Requiere service_role, super_admin o is_approved_organizer(p_organizer_id). Recaudacion y comisiones salen de organizer_paid_ledger.';

revoke all on function public.get_organizer_metrics(uuid) from public;
revoke all on function public.get_organizer_metrics(uuid) from anon;
grant execute on function public.get_organizer_metrics(uuid)
  to authenticated, service_role;
