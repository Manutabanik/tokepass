-- =============================================================================
-- P17: Platform Money Ledger — enriched order audit for super_admin
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
     and v_status not in ('pending', 'paid', 'failed', 'expired') then
    raise exception 'Estado de orden inválido'
      using errcode = '22023';
  end if;

  return query
  with order_context as (
    select distinct on (t.order_id)
      t.order_id,
      e.id as event_id,
      e.title as event_title,
      e.organizer_id,
      coalesce(nullif(btrim(op.full_name), ''), op.email, 'Organizador')
        as organizer_name,
      coalesce(op.service_charge_rate, 0.15) as organizer_rate
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    join public.profiles as op on op.id = e.organizer_id
    where t.order_id is not null
    order by t.order_id, t.created_at asc
  )
  select
    o.id as order_id,
    o.created_at,
    o.status::text,
    coalesce(o.payment_method::text, 'mercadopago') as payment_method,
    o.mp_payment_id,
    oc.event_id,
    coalesce(oc.event_title, 'Sin evento') as event_title,
    oc.organizer_id,
    coalesce(oc.organizer_name, 'Sin productora') as organizer_name,
    o.buyer_id,
    coalesce(nullif(btrim(bp.full_name), ''), bp.email, 'Comprador')
      as buyer_name,
    coalesce(bp.email, '') as buyer_email,
    round(coalesce(o.total_amount, 0), 2) as gross_amount,
    round(coalesce(o.service_charge, 0), 2) as platform_fee_amount,
    round(
      greatest(
        coalesce(o.total_amount, 0) - coalesce(o.service_charge, 0),
        0
      ),
      2
    ) as organizer_net_amount,
    case
      when coalesce(o.total_amount, 0) > 0 then
        round(coalesce(o.service_charge, 0) / o.total_amount, 4)
      else coalesce(oc.organizer_rate, 0.15)
    end as fee_rate
  from public.orders as o
  left join order_context as oc on oc.order_id = o.id
  left join public.profiles as bp on bp.id = o.buyer_id
  where (p_organizer_id is null or oc.organizer_id = p_organizer_id)
    and (p_event_id is null or oc.event_id = p_event_id)
    and (v_status is null or o.status::text = v_status)
  order by o.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_platform_orders_ledger(uuid, uuid, text, integer)
  from public, anon;
grant execute on function public.get_platform_orders_ledger(uuid, uuid, text, integer)
  to authenticated, service_role;

comment on function public.get_platform_orders_ledger(uuid, uuid, text, integer) is
  'Ledger soberano All-In: bruto, comisión Tokepass y neto productora. Solo super_admin.';
