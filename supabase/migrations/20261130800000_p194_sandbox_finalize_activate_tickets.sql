-- p194 · Sandbox: emitir tickets is_test aunque finalize rechace el provider.
-- No abortar la compra de prueba: activar pending_payment y sellar is_test.

create or replace function public.finalize_sandbox_paid_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result jsonb;
  v_tickets integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  update public.orders
  set
    is_test = true,
    environment = 'test',
    legal_consent_required = false,
    updated_at = now()
  where id = p_order_id
    and status in ('pending', 'paid');

  update public.tickets
  set
    is_test = true,
    updated_at = now()
  where order_id = p_order_id;

  perform public.release_test_order_live_stock(p_order_id);

  v_result := public.finalize_paid_order(
    p_order_id,
    'sandbox',
    'sandbox:' || p_order_id::text,
    jsonb_build_object('sandbox', true)
  );

  if coalesce(v_result ->> 'code', '') = 'invalid_provider' then
    v_result := public.finalize_paid_order(
      p_order_id,
      'mercadopago',
      'sandbox:' || p_order_id::text,
      jsonb_build_object('sandbox', true)
    );
  end if;

  update public.tickets
  set
    status = 'valid',
    is_test = true,
    updated_at = now()
  where order_id = p_order_id
    and status = 'pending_payment'::public.ticket_status;

  get diagnostics v_tickets = row_count;

  if coalesce(v_result ->> 'ok', 'false') = 'true' then
    update public.orders
    set
      payment_method = 'test_sandbox',
      payment_provider = 'sandbox',
      is_test = true,
      environment = 'test',
      legal_consent_required = false,
      updated_at = now()
    where id = p_order_id;
  elsif v_tickets > 0 then
    update public.orders
    set
      status = 'paid',
      payment_method = 'test_sandbox',
      payment_provider = 'sandbox',
      provider_transaction_id = coalesce(
        provider_transaction_id,
        'sandbox:' || p_order_id::text
      ),
      mp_payment_id = coalesce(mp_payment_id, 'sandbox:' || p_order_id::text),
      is_test = true,
      environment = 'test',
      legal_consent_required = false,
      updated_at = now()
    where id = p_order_id
      and status = 'pending';

    v_result := jsonb_build_object(
      'ok', true,
      'code', 'sandbox_paid',
      'tickets_activated', v_tickets
    );
  end if;

  update public.tickets
  set
    is_test = true,
    updated_at = now()
  where order_id = p_order_id;

  return v_result;
end;
$$;

comment on function public.finalize_sandbox_paid_order(uuid) is
  'Confirma una compra sandbox: emite tickets is_test, no vale en puerta, y encola el recibo.';
