-- p193 · Métricas del centro de mando: solo producción (sin sandbox / is_test).

create or replace function public.get_event_dashboard_metrics(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_capacity integer := 0;
  v_sold integer := 0;
  v_revenue numeric(14, 2) := 0;
begin
  if p_event_id is null then
    return jsonb_build_object(
      'tickets_sold', 0,
      'revenue', 0,
      'capacity', 0,
      'available', 0
    );
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin()
     and not exists (
       select 1
       from public.events as e
       where e.id = p_event_id
         and e.organizer_id = auth.uid()
     )
     and not public.user_is_event_organizer_or_staff(
       p_event_id,
       auth.uid(),
       array['door_staff'::public.event_staff_role]
     ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select coalesce(sum(greatest(0, tt.capacity)), 0)::integer
    into v_capacity
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id;

  select coalesce(count(*)::integer, 0)
    into v_sold
  from public.tickets as t
  join public.orders as o on o.id = t.order_id
  where t.event_id = p_event_id
    and o.status = 'paid'
    and coalesce(t.is_test, false) = false
    and coalesce(o.is_test, false) = false
    and coalesce(o.environment, 'production') is distinct from 'test'
    and coalesce(o.payment_method, '') is distinct from 'test_sandbox'
    and t.status not in (
      'pending_payment'::public.ticket_status,
      'cancelled'::public.ticket_status,
      'revoked'::public.ticket_status
    );

  select coalesce(sum(o.total_amount), 0)
    into v_revenue
  from public.orders as o
  where o.status = 'paid'
    and coalesce(o.is_test, false) = false
    and coalesce(o.environment, 'production') is distinct from 'test'
    and coalesce(o.payment_method, '') is distinct from 'test_sandbox'
    and exists (
      select 1
      from public.tickets as t
      where t.order_id = o.id
        and t.event_id = p_event_id
        and coalesce(t.is_test, false) = false
    );

  return jsonb_build_object(
    'tickets_sold', v_sold,
    'revenue', v_revenue,
    'capacity', v_capacity,
    'available', greatest(0, v_capacity - v_sold)
  );
end;
$$;

comment on function public.get_event_dashboard_metrics(uuid) is
  'KPIs del evento para el organizador. Solo ordenes paid de produccion (sin is_test ni test_sandbox).';

revoke all on function public.get_event_dashboard_metrics(uuid) from public;
revoke all on function public.get_event_dashboard_metrics(uuid) from anon;
grant execute on function public.get_event_dashboard_metrics(uuid)
  to authenticated, service_role;
