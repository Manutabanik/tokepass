-- =============================================================================
-- P25: Fix platform orders ledger — ambiguous RETURNS TABLE columns
-- =============================================================================
-- PL/pgSQL OUT params (order_id, created_at, status, event_id, …) collide with
-- identically named select-list / CTE columns inside RETURN QUERY, producing
-- "column reference … is ambiguous" and crashing /superadmin/orders.
-- =============================================================================

create or replace function public.get_platform_orders_ledger(
  p_organizer_id uuid default null,
  p_event_id uuid default null,
  p_status text default null,
  p_limit integer default 200
)
returns table (
  order_id uuid,
  created_at timestamptz,
  status text,
  payment_method text,
  mp_payment_id text,
  event_id uuid,
  event_title text,
  organizer_id uuid,
  organizer_name text,
  buyer_id uuid,
  buyer_name text,
  buyer_email text,
  gross_amount numeric,
  platform_fee_amount numeric,
  organizer_net_amount numeric,
  fee_rate numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Forbidden: solo super_admin puede auditar el ledger'
      using errcode = '42501';
  end if;

  if v_status is not null
     and v_status not in (
       'pending',
       'paid',
       'failed',
       'expired',
       'refunded'
     ) then
    raise exception 'Estado de orden inválido'
      using errcode = '22023';
  end if;

  return query
  with order_context as (
    select distinct on (t.order_id)
      t.order_id as ctx_order_id,
      e.id as ctx_event_id,
      e.title as ctx_event_title,
      e.organizer_id as ctx_organizer_id,
      coalesce(nullif(btrim(op.full_name), ''), op.email, 'Organizador')
        as ctx_organizer_name,
      coalesce(op.service_charge_rate, 0.15) as ctx_organizer_rate
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    join public.profiles as op on op.id = e.organizer_id
    where t.order_id is not null
    order by t.order_id, t.created_at asc
  )
  select
    o.id,
    o.created_at,
    o.status::text,
    coalesce(o.payment_method::text, 'mercadopago'),
    o.mp_payment_id,
    oc.ctx_event_id,
    coalesce(oc.ctx_event_title, 'Sin evento'),
    oc.ctx_organizer_id,
    coalesce(oc.ctx_organizer_name, 'Sin productora'),
    o.buyer_id,
    coalesce(nullif(btrim(bp.full_name), ''), bp.email, 'Comprador'),
    coalesce(bp.email, ''),
    round(coalesce(o.total_amount, 0), 2),
    round(coalesce(o.service_charge, 0), 2),
    round(
      greatest(
        coalesce(o.total_amount, 0) - coalesce(o.service_charge, 0),
        0
      ),
      2
    ),
    case
      when coalesce(o.total_amount, 0) > 0 then
        round(coalesce(o.service_charge, 0) / o.total_amount, 4)
      else coalesce(oc.ctx_organizer_rate, 0.15)
    end
  from public.orders as o
  left join order_context as oc on oc.ctx_order_id = o.id
  left join public.profiles as bp on bp.id = o.buyer_id
  where (p_organizer_id is null or oc.ctx_organizer_id = p_organizer_id)
    and (p_event_id is null or oc.ctx_event_id = p_event_id)
    and (v_status is null or o.status::text = v_status)
  order by o.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_platform_orders_ledger(uuid, uuid, text, integer)
  from public, anon;
grant execute on function public.get_platform_orders_ledger(uuid, uuid, text, integer)
  to authenticated, service_role;

create or replace function public.get_platform_orders_ledger_totals(
  p_organizer_id uuid default null,
  p_event_id uuid default null,
  p_status text default null
)
returns table (
  gross numeric,
  platform_fee numeric,
  organizer_net numeric,
  order_count bigint,
  paid_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions
as $$
#variable_conflict use_column
declare
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_status is not null
     and v_status not in (
       'pending',
       'paid',
       'failed',
       'expired',
       'refunded'
     ) then
    raise exception 'Invalid order status' using errcode = '22023';
  end if;

  return query
  with order_context as (
    select distinct on (t.order_id)
      t.order_id as ctx_order_id,
      e.id as ctx_event_id,
      e.organizer_id as ctx_organizer_id
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.order_id is not null
    order by t.order_id, t.created_at asc
  )
  select
    round(coalesce(sum(o.total_amount) filter (where o.status = 'paid'), 0), 2),
    round(coalesce(sum(o.service_charge) filter (where o.status = 'paid'), 0), 2),
    round(
      coalesce(
        sum(greatest(o.total_amount - o.service_charge, 0))
          filter (where o.status = 'paid'),
        0
      ),
      2
    ),
    count(*)::bigint,
    count(*) filter (where o.status = 'paid')
  from public.orders as o
  left join order_context as oc on oc.ctx_order_id = o.id
  where (p_organizer_id is null or oc.ctx_organizer_id = p_organizer_id)
    and (p_event_id is null or oc.ctx_event_id = p_event_id)
    and (v_status is null or o.status::text = v_status);
end;
$$;

revoke all on function public.get_platform_orders_ledger_totals(uuid, uuid, text)
  from public, anon;
grant execute on function public.get_platform_orders_ledger_totals(uuid, uuid, text)
  to authenticated, service_role;
