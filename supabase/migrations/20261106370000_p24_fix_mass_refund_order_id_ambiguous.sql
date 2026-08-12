-- =============================================================================
-- P24: Fix ambiguous order_id in execute_mass_event_refund_tx
-- =============================================================================
-- RETURNS TABLE (order_id ...) creates PL/pgSQL variables that collide with
-- tickets.order_id in unqualified UPDATE ... WHERE order_id = ...
-- Qualify table columns so mass-cancel / refund can run.
-- =============================================================================

create or replace function public.execute_mass_event_refund_tx(
  p_event_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns table (
  order_id uuid,
  mp_payment_id text,
  total_amount numeric,
  risk_tier text,
  organizer_id uuid,
  tickets_cancelled integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_organizer public.profiles%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_order_id uuid;
  v_mp_payment_id text;
  v_total_amount numeric;
  v_ticket_count integer := 0;
  v_orders_count integer := 0;
  v_total_tickets integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as actor
    where actor.id = p_actor_id
      and actor.role::text = 'super_admin'
  ) then
    insert into public.platform_ops_audit (
      actor_id,
      action,
      event_id,
      reason,
      metadata
    )
    values (
      p_actor_id,
      'MASS_REFUND_UNAUTHORIZED',
      p_event_id,
      v_reason,
      jsonb_build_object('blocked', true)
    );
    raise exception 'INVALID_GOVERNANCE_ACTOR' using errcode = '42501';
  end if;

  if v_reason is null or char_length(v_reason) < 8 then
    raise exception 'REFUND_REASON_REQUIRED' using errcode = '22023';
  end if;

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_organizer
  from public.profiles as p
  where p.id = v_event.organizer_id
  for update;

  if not found then
    raise exception 'ORGANIZER_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.events as e
  set
    status = 'cancelled'::public.event_status,
    updated_at = now()
  where e.id = p_event_id;

  for v_order_id, v_mp_payment_id, v_total_amount in
    select distinct o.id, o.mp_payment_id, o.total_amount
    from public.orders as o
    where o.status = 'paid'
      and exists (
        select 1
        from public.tickets as t
        where t.order_id = o.id
          and t.event_id = p_event_id
      )
  loop
    update public.tickets as t
    set
      status = 'cancelled'::public.ticket_status,
      updated_at = now()
    where t.order_id = v_order_id
      and t.event_id = p_event_id
      and t.status::text in (
        'valid',
        'pending_payment',
        'used',
        'scanned'
      );

    get diagnostics v_ticket_count = row_count;
    v_total_tickets := v_total_tickets + coalesce(v_ticket_count, 0);

    update public.orders as o
    set
      status = 'refunded',
      updated_at = now()
    where o.id = v_order_id
      and o.status = 'paid';

    v_orders_count := v_orders_count + 1;

    order_id := v_order_id;
    mp_payment_id := v_mp_payment_id;
    total_amount := v_total_amount;
    risk_tier := v_organizer.risk_tier::text;
    organizer_id := v_organizer.id;
    tickets_cancelled := coalesce(v_ticket_count, 0);
    return next;
  end loop;

  insert into public.platform_ops_audit (
    actor_id,
    action,
    event_id,
    organizer_id,
    reason,
    metadata
  )
  values (
    p_actor_id,
    'MASS_REFUND_TRIGGERED',
    p_event_id,
    v_organizer.id,
    v_reason,
    jsonb_build_object(
      'orders_refunded', v_orders_count,
      'tickets_cancelled', v_total_tickets,
      'risk_tier', v_organizer.risk_tier,
      'event_title', v_event.title
    )
  );
end;
$$;

revoke all on function public.execute_mass_event_refund_tx(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.execute_mass_event_refund_tx(uuid, uuid, text)
  to service_role;
