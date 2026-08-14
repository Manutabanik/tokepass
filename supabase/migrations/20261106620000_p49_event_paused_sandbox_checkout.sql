-- =============================================================================
-- P49: Evento pausado + checkout sandbox (test_sandbox)
-- =============================================================================

-- 1) Estado paused
do $$
begin
  alter type public.event_status add value if not exists 'paused';
exception
  when duplicate_object then null;
end;
$$;

-- 2) Medio de pago test_sandbox (sin Mercado Pago)
alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (
    payment_method in (
      'mercadopago',
      'cash_pos',
      'transfer_pos',
      'card_pos',
      'test_sandbox'
    )
  );

comment on column public.orders.payment_method is
  'mercadopago | cash_pos | transfer_pos | card_pos | test_sandbox';

-- 3) Gate de compra: published para todos; draft/paused solo staff del evento
create or replace function public.event_is_buyable(p_event_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_status public.event_status;
  v_organizer_id uuid;
begin
  select e.status, e.organizer_id
    into v_status, v_organizer_id
  from public.events as e
  where e.id = p_event_id;

  if not found then
    return false;
  end if;

  if v_status = 'published'::public.event_status then
    return true;
  end if;

  -- Borrador / pausado: solo organizador, super admin o service_role (sandbox / preview)
  if v_status in (
    'draft'::public.event_status,
    'paused'::public.event_status
  ) then
    return (
      coalesce(auth.role(), '') = 'service_role'
      or auth.uid() = v_organizer_id
      or public.is_super_admin()
    );
  end if;

  return false;
end;
$$;

revoke all on function public.event_is_buyable(uuid) from public;
grant execute on function public.event_is_buyable(uuid)
  to authenticated, service_role;

-- 4) Gate público (sin filtrar RLS) para mensaje de pausado/borrador
create or replace function public.get_event_public_access_gate(p_event_id uuid)
returns table (
  event_id uuid,
  title text,
  status public.event_status
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select e.id, e.title, e.status
  from public.events e
  where e.id = p_event_id
    and e.status::text in ('draft', 'paused', 'cancelled', 'archived', 'completed');
end;
$$;

revoke all on function public.get_event_public_access_gate(uuid) from public;
grant execute on function public.get_event_public_access_gate(uuid)
  to anon, authenticated, service_role;

-- 5) Escáner: permitir tickets is_test de órdenes sandbox en eventos published
--    (reemplaza P27 preservando is_ticket_admission_eligible + partial admissions)
create or replace function public.scan_ticket_admission(
  p_ticket_id uuid,
  p_validated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_event_status public.event_status;
  v_is_sandbox boolean := false;
  v_next integer;
begin
  if auth.uid() is null
     or auth.uid() is distinct from p_validated_by then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not public.user_is_event_organizer_or_staff(
    v_ticket.event_id,
    p_validated_by,
    array['door_staff'::public.event_staff_role]
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select e.status
    into v_event_status
  from public.events as e
  where e.id = v_ticket.event_id;

  if v_ticket.order_id is not null then
    select (o.payment_method::text = 'test_sandbox')
      into v_is_sandbox
    from public.orders o
    where o.id = v_ticket.order_id;
  end if;

  if coalesce(v_ticket.is_test, false)
     and v_event_status = 'published'::public.event_status
     and not coalesce(v_is_sandbox, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'test_ticket_live',
      'is_test', true
    );
  end if;

  if v_ticket.status <> 'valid'::public.ticket_status then
    return jsonb_build_object(
      'ok', false,
      'code', case
        when v_ticket.status in (
          'used'::public.ticket_status,
          'scanned'::public.ticket_status
        ) then 'already_used'
        else 'invalid_status'
      end,
      'admissions_used', v_ticket.admissions_used,
      'max_admissions', v_ticket.max_admissions
    );
  end if;

  if not public.is_ticket_admission_eligible(v_ticket.id) then
    return jsonb_build_object('ok', false, 'code', 'unpaid');
  end if;

  v_next := v_ticket.admissions_used + 1;

  update public.tickets
  set
    admissions_used = v_next,
    status = case
      when v_next >= greatest(1, v_ticket.max_admissions)
        then 'used'::public.ticket_status
      else 'valid'::public.ticket_status
    end,
    scanned_at = case
      when v_next >= greatest(1, v_ticket.max_admissions)
        then now()
      else scanned_at
    end,
    validated_at = now(),
    validated_by = p_validated_by,
    updated_at = now()
  where id = v_ticket.id;

  return jsonb_build_object(
    'ok', true,
    'code', case
      when v_next >= greatest(1, v_ticket.max_admissions)
        then 'complete'
      else 'partial'
    end,
    'admissions_used', v_next,
    'max_admissions', greatest(1, v_ticket.max_admissions),
    'remaining', greatest(0, v_ticket.max_admissions - v_next),
    'is_test', coalesce(v_ticket.is_test, false),
    'is_test_scan', coalesce(v_ticket.is_test, false)
      and (
        v_event_status = 'draft'::public.event_status
        or coalesce(v_is_sandbox, false)
      ),
    'is_sandbox', coalesce(v_is_sandbox, false)
  );
end;
$$;

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;

-- 6) Marcar orden como sandbox + tickets is_test (post-finalize)
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
