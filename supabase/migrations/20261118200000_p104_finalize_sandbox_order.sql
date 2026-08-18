-- =============================================================================
-- P104 · Finalizar compra de prueba en una sola transacción
-- Apaga el gate legal (P20) y confirma la orden sin Mercado Pago.
-- =============================================================================

alter table public.orders
  add column if not exists is_test boolean not null default false,
  add column if not exists legal_consent_required boolean;

update public.orders
set legal_consent_required = false
where legal_consent_required is null;

alter table public.orders
  alter column legal_consent_required set default true,
  alter column legal_consent_required set not null;

create or replace function public.enforce_paid_order_legal_consent()
returns trigger
language plpgsql
set search_path = pg_catalog, extensions, public
as $$
begin
  if coalesce(new.is_test, false) then
    return new;
  end if;

  if new.status = 'paid'
     and old.status is distinct from new.status
     and coalesce(new.legal_consent_required, true)
     and (
       not coalesce(new.terms_accepted, false)
       or new.terms_accepted_at is null
       or nullif(btrim(coalesce(new.legal_terms_version, '')), '') is null
       or nullif(btrim(coalesce(new.organizer_legal_name_snapshot, '')), '') is null
       or coalesce(new.organizer_tax_id_snapshot, '') !~ '^[0-9]{11}$'
     ) then
    raise exception 'LEGAL_CONSENT_REQUIRED'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_paid_order_legal_consent on public.orders;
create trigger enforce_paid_order_legal_consent
before update of status on public.orders
for each row
execute function public.enforce_paid_order_legal_consent();

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
    legal_consent_required = false,
    updated_at = now()
  where id = p_order_id
    and status = 'pending';

  v_result := public.finalize_paid_order(
    p_order_id,
    'mercadopago',
    'sandbox:' || p_order_id::text,
    jsonb_build_object('sandbox', true)
  );

  if coalesce(v_result ->> 'ok', 'false') = 'true' then
    update public.orders
    set
      payment_method = 'test_sandbox',
      payment_provider = 'sandbox',
      is_test = true,
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

revoke all on function public.finalize_sandbox_paid_order(uuid) from public;
grant execute on function public.finalize_sandbox_paid_order(uuid)
  to service_role;

comment on function public.finalize_sandbox_paid_order(uuid) is
  'Confirma una orden de preview: is_test + sin gate legal + tickets de prueba.';
