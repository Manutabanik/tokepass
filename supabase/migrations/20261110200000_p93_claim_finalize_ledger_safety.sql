-- =============================================================================
-- P93 - Claim ledger only after successful finalize; refund duplicate payments
-- =============================================================================

create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_provider text,
  p_transaction_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_order public.orders%rowtype;
  v_pending_tickets integer := 0;
  v_valid_tickets integer := 0;
  v_activated integer := 0;
  v_updated integer := 0;
  v_tier_id uuid;
  v_count integer;
  v_provider public.payment_provider_type;
  v_tx text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_tx := nullif(btrim(coalesce(p_transaction_id, '')), '');
  if p_order_id is null or v_tx is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  begin
    v_provider := btrim(coalesce(p_provider, ''))::public.payment_provider_type;
  exception
    when invalid_text_representation then
      return jsonb_build_object(
        'ok', false,
        'code', 'invalid_provider',
        'provider', p_provider
      );
  end;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  select count(*)::integer into v_pending_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'pending_payment'::public.ticket_status;

  select count(*)::integer into v_valid_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'valid'::public.ticket_status;

  if v_order.status = 'paid'
     and (
       v_order.provider_transaction_id is not distinct from v_tx
       or v_order.mp_payment_id is not distinct from v_tx
     ) then
    if v_pending_tickets > 0 then
      if exists (
        select 1
        from public.tickets as t
        join public.event_seating_units as u on u.id = t.seating_unit_id
        where t.order_id = p_order_id
          and t.status = 'pending_payment'::public.ticket_status
          and (
            u.status <> 'reserved'
            or u.reserved_order_id is distinct from p_order_id
            or u.reserved_until <= now()
          )
      ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'order_expired',
          'needs_refund', true
        );
      end if;

      update public.tickets
      set status = 'valid'::public.ticket_status, updated_at = now()
      where order_id = p_order_id
        and status = 'pending_payment'::public.ticket_status;
    end if;

    begin
      perform public.activate_order_item_redemptions(p_order_id);
    exception when undefined_function then null;
    end;

    return jsonb_build_object(
      'ok', true,
      'code', 'already_paid',
      'idempotent', true,
      'payment_provider', v_order.payment_provider::text
    );
  end if;

  if v_order.status = 'paid'
     and v_order.provider_transaction_id is distinct from v_tx
     and v_order.mp_payment_id is distinct from v_tx then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_paid_other_payment',
      'needs_refund', true,
      'mp_payment_id', v_order.mp_payment_id,
      'provider_transaction_id', v_order.provider_transaction_id
    );
  end if;

  if v_order.status = 'expired' then
    return jsonb_build_object(
      'ok', false,
      'code', 'order_expired',
      'needs_refund', true
    );
  end if;

  if v_order.status is distinct from 'pending' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'status', v_order.status
    );
  end if;

  if exists (
    select 1
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.order_id = p_order_id
      and not public.is_approved_organizer(e.organizer_id)
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'organizer_suspended',
      'needs_refund', true
    );
  end if;

  if exists (
    select 1
    from public.tickets as t
    join public.event_seating_units as u on u.id = t.seating_unit_id
    where t.order_id = p_order_id
      and (
        u.status <> 'reserved'
        or u.reserved_order_id is distinct from p_order_id
        or u.reserved_until <= now()
      )
  ) then
    for v_tier_id, v_count in
      select s.tier_id, s.unit_count
      from public.count_pending_order_sold_units(p_order_id) as s
    loop
      update public.ticket_tiers
      set sold = greatest(0, sold - v_count)
      where id = v_tier_id;
    end loop;

    update public.tickets
    set status = 'cancelled'::public.ticket_status, updated_at = now()
    where order_id = p_order_id
      and status = 'pending_payment'::public.ticket_status;

    update public.orders
    set status = 'expired', updated_at = now()
    where id = p_order_id and status = 'pending';

    return jsonb_build_object(
      'ok', false,
      'code', 'seating_hold_expired',
      'needs_refund', true
    );
  end if;

  if v_pending_tickets = 0 and v_valid_tickets = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_tickets',
      'needs_refund', true
    );
  end if;

  if v_pending_tickets > 0 then
    update public.tickets
    set status = 'valid'::public.ticket_status, updated_at = now()
    where order_id = p_order_id
      and status = 'pending_payment'::public.ticket_status;

    get diagnostics v_activated = row_count;
    if v_activated is distinct from v_pending_tickets then
      raise exception 'TICKET_ACTIVATION_MISMATCH'
        using errcode = 'P0001';
    end if;
  end if;

  begin
    perform public.activate_order_item_redemptions(p_order_id);
  exception when undefined_function then null;
  end;

  update public.orders
  set
    status = 'paid',
    payment_provider = v_provider,
    provider_transaction_id = v_tx,
    mp_payment_id = v_tx,
    provider_metadata =
      coalesce(provider_metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  where id = p_order_id and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'ORDER_STATUS_RACE' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'paid',
    'tickets_activated', coalesce(v_activated, 0),
    'idempotent', false,
    'payment_provider', v_provider::text,
    'provider_transaction_id', v_tx
  );
end;
$$;

comment on function public.finalize_paid_order(uuid, text, text, jsonb) is
  'Confirma una orden pending. already_paid_other_payment incluye needs_refund para reembolsar el segundo cobro.';

create or replace function public.claim_and_finalize_paid_order(
  p_order_id uuid,
  p_provider text,
  p_transaction_id text,
  p_event_type text default 'payment.approved',
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result jsonb;
  v_provider public.payment_provider_type;
  v_tx text;
  v_ok boolean := false;
  v_code text;
  v_needs_refund boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_tx := nullif(btrim(coalesce(p_transaction_id, '')), '');
  if p_order_id is null or v_tx is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  begin
    v_provider := btrim(coalesce(p_provider, ''))::public.payment_provider_type;
  exception
    when invalid_text_representation then
      return jsonb_build_object('ok', false, 'code', 'invalid_provider');
  end;

  v_result := public.finalize_paid_order(
    p_order_id,
    p_provider,
    v_tx,
    coalesce(p_payload, '{}'::jsonb)
  );

  if v_result is null then
    raise exception 'claim_finalize_rejected:finalize_failed'
      using errcode = 'P0001';
  end if;

  v_ok := coalesce((v_result ->> 'ok')::boolean, false);
  v_code := nullif(btrim(coalesce(v_result ->> 'code', '')), '');
  v_needs_refund := coalesce((v_result ->> 'needs_refund')::boolean, false);

  if v_ok then
    insert into public.payment_webhook_events (
      provider,
      external_event_id,
      event_type,
      payload
    )
    values (
      v_provider,
      v_tx,
      coalesce(nullif(btrim(coalesce(p_event_type, '')), ''), 'payment.approved'),
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (provider, external_event_id) do nothing;

    return v_result;
  end if;

  if v_code = 'already_paid_other_payment' then
    return v_result || jsonb_build_object('needs_refund', true);
  end if;

  if v_needs_refund then
    return v_result;
  end if;

  raise exception 'claim_finalize_rejected:%', coalesce(v_code, 'finalize_failed')
    using errcode = 'P0001';
end;
$$;

comment on function public.claim_and_finalize_paid_order(uuid, text, text, text, jsonb) is
  'Finaliza primero. Solo inserta payment_webhook_events si ok=true. Soft-fail con needs_refund no consume el ledger. Otros ok=false hacen RAISE para rollback y retry del PSP.';

revoke all on function public.finalize_paid_order(uuid, text, text, jsonb) from public;
revoke all on function public.finalize_paid_order(uuid, text, text, jsonb)
  from anon, authenticated;
grant execute on function public.finalize_paid_order(uuid, text, text, jsonb)
  to service_role;

revoke all on function public.claim_and_finalize_paid_order(uuid, text, text, text, jsonb)
  from public;
grant execute on function public.claim_and_finalize_paid_order(uuid, text, text, text, jsonb)
  to service_role;
