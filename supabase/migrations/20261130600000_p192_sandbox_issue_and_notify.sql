-- p192 · Sandbox emite entradas is_test y no las deja como cobro live.
-- El mail lo dispara el outbox (igual que el webhook); el app drena después de finalize.

create or replace function public.orders_propagate_is_test_to_tickets()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(new.is_test, false) then
    update public.tickets
    set
      is_test = true,
      updated_at = now()
    where order_id = new.id
      and coalesce(is_test, false) = false;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_propagate_is_test_to_tickets_trg on public.orders;
create trigger orders_propagate_is_test_to_tickets_trg
after insert or update of is_test
on public.orders
for each row
when (new.is_test = true)
execute function public.orders_propagate_is_test_to_tickets();

create or replace function public.finalize_sandbox_paid_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result jsonb;
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
    and status = 'pending';

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

    update public.tickets
    set
      is_test = true,
      updated_at = now()
    where order_id = p_order_id;
  end if;

  return v_result;
end;
$$;

comment on function public.finalize_sandbox_paid_order(uuid) is
  'Confirma una compra sandbox: emite tickets is_test, no vale en puerta, y encola el recibo.';
