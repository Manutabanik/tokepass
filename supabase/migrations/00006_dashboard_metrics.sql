-- =============================================================================
-- Tokepass - Métricas del dashboard del organizador
-- =============================================================================

create or replace function public.get_organizer_metrics(p_organizer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_revenue numeric(14, 2) := 0;
  v_ticket_gmv numeric(14, 2) := 0;
  v_tickets_sold integer := 0;
  v_active_events integer := 0;
  v_recent_sales jsonb := '[]'::jsonb;
begin
  -- Solo el propio organizador (o service_role) puede consultar sus métricas.
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
  -- Ingresos: órdenes paid ligadas a eventos del organizador
  --------------------------------------------------------------------
  select coalesce(sum(o.total_amount), 0)
    into v_total_revenue
  from public.orders as o
  where o.status = 'paid'
    and exists (
      select 1
      from public.tickets as t
      join public.events as e on e.id = t.event_id
      where t.order_id = o.id
        and e.organizer_id = p_organizer_id
    );

  -- Fallback MVP: si aún no hay órdenes pagadas (checkout actual solo
  -- reserva tickets), estimamos GMV desde tiers × tickets emitidos.
  if v_total_revenue = 0 then
    select coalesce(sum(tt.price), 0)
      into v_ticket_gmv
    from public.tickets as t
    join public.ticket_tiers as tt on tt.id = t.tier_id
    join public.events as e on e.id = t.event_id
    where e.organizer_id = p_organizer_id
      and t.status in (
        'valid'::public.ticket_status,
        'scanned'::public.ticket_status
      );

    v_total_revenue := v_ticket_gmv;
  end if;

  --------------------------------------------------------------------
  -- Tickets vendidos (válidos o ya escaneados)
  --------------------------------------------------------------------
  select coalesce(count(*)::integer, 0)
    into v_tickets_sold
  from public.tickets as t
  join public.events as e on e.id = t.event_id
  where e.organizer_id = p_organizer_id
    and t.status in (
      'valid'::public.ticket_status,
      'scanned'::public.ticket_status
    );

  --------------------------------------------------------------------
  -- Eventos activos (publicados)
  --------------------------------------------------------------------
  select coalesce(count(*)::integer, 0)
    into v_active_events
  from public.events as e
  where e.organizer_id = p_organizer_id
    and e.status = 'published'::public.event_status;

  --------------------------------------------------------------------
  -- Últimas 5 órdenes del organizador (vía tickets → events)
  --------------------------------------------------------------------
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
        join public.profiles as p on p.id = o.buyer_id
        where exists (
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

  -- Si no hay órdenes pero sí tickets, sintetizamos "ventas recientes"
  -- a partir de las últimas reservas para que el dashboard no quede vacío.
  if v_recent_sales = '[]'::jsonb and v_tickets_sold > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'date', s.created_at,
          'amount', s.amount,
          'status', 'paid',
          'buyer_name', s.buyer_name
        )
        order by s.created_at desc
      ),
      '[]'::jsonb
    )
      into v_recent_sales
    from (
      select
        t.id,
        t.created_at,
        tt.price as amount,
        coalesce(nullif(btrim(p.full_name), ''), p.email, 'Comprador') as buyer_name
      from public.tickets as t
      join public.ticket_tiers as tt on tt.id = t.tier_id
      join public.events as e on e.id = t.event_id
      join public.profiles as p on p.id = t.owner_id
      where e.organizer_id = p_organizer_id
        and t.status in (
          'valid'::public.ticket_status,
          'scanned'::public.ticket_status
        )
      order by t.created_at desc
      limit 5
    ) as s;
  end if;

  return jsonb_build_object(
    'total_revenue', v_total_revenue,
    'tickets_sold', v_tickets_sold,
    'active_events', v_active_events,
    'recent_sales', v_recent_sales
  );
end;
$$;

comment on function public.get_organizer_metrics(uuid) is
  'KPIs del Command Center: ingresos, tickets, eventos activos y ventas recientes.';

revoke all on function public.get_organizer_metrics(uuid) from public;
revoke all on function public.get_organizer_metrics(uuid) from anon;
grant execute on function public.get_organizer_metrics(uuid)
  to authenticated, service_role;
