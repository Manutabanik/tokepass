-- =============================================================================
-- P103 · Consentimiento legal al pagar + excepción para órdenes de prueba
-- Restaura el contrato P20 si falta y no bloquea finalize sandbox/is_test.
-- =============================================================================

alter table public.profiles
  add column if not exists legal_name text,
  add column if not exists tax_id text;

alter table public.orders
  add column if not exists legal_consent_required boolean,
  add column if not exists terms_accepted boolean not null default false,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists legal_terms_version text,
  add column if not exists organizer_legal_name_snapshot text,
  add column if not exists organizer_tax_id_snapshot text;

update public.orders
set legal_consent_required = false
where legal_consent_required is null;

alter table public.orders
  alter column legal_consent_required set default true,
  alter column legal_consent_required set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_legal_consent_shape_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_legal_consent_shape_check
      check (
        not terms_accepted
        or (
          terms_accepted_at is not null
          and nullif(btrim(legal_terms_version), '') is not null
          and nullif(btrim(organizer_legal_name_snapshot), '') is not null
          and organizer_tax_id_snapshot ~ '^[0-9]{11}$'
        )
      );
  end if;
end
$$;

create or replace function public.enforce_paid_order_legal_consent()
returns trigger
language plpgsql
set search_path = pg_catalog, extensions, public
as $$
begin
  -- Las compras de prueba no tienen validez comercial: no exigir CUIT/T&C.
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

create or replace function public.mark_order_test_sandbox(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.orders
  set
    payment_method = 'test_sandbox',
    payment_provider = 'sandbox',
    is_test = true,
    legal_consent_required = false,
    updated_at = now()
  where id = p_order_id
    and status = 'paid';

  if not found then
    return false;
  end if;

  update public.tickets
  set
    is_test = true,
    updated_at = now()
  where order_id = p_order_id;

  return true;
end;
$$;

revoke all on function public.mark_order_test_sandbox(uuid) from public;
grant execute on function public.mark_order_test_sandbox(uuid)
  to service_role;

comment on function public.enforce_paid_order_legal_consent() is
  'Impide pasar a paid sin evidencia legal. is_test=true no exige consentimiento.';
