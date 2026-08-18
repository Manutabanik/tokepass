-- =============================================================================
-- P102 · Modo borrador / preview: preview_key + is_test en órdenes
-- Tickets de prueba nunca entran en puerta real.
-- =============================================================================

alter table public.events
  add column if not exists preview_key uuid not null default gen_random_uuid();

create unique index if not exists events_preview_key_key
  on public.events (preview_key);

comment on column public.events.preview_key is
  'Clave opaca para abrir el borrador con ?preview_key=. No indexar en buscadores.';

alter table public.orders
  add column if not exists is_test boolean not null default false;

create index if not exists orders_is_test_idx
  on public.orders (is_test)
  where is_test = true;

comment on column public.orders.is_test is
  'Orden de prueba (preview/sandbox). Los tickets asociados no valen en puerta.';

update public.orders as o
set is_test = true
where o.is_test = false
  and (
    o.payment_method = 'test_sandbox'
    or o.mp_payment_id like 'sandbox:%'
    or exists (
      select 1
      from public.tickets as t
      where t.order_id = o.id
        and t.is_test = true
    )
  );

create or replace function public.event_preview_key_matches(
  p_event_id uuid,
  p_key uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and e.preview_key = p_key
      and e.status = 'draft'::public.event_status
  );
$$;

revoke all on function public.event_preview_key_matches(uuid, uuid)
  from public, anon;
grant execute on function public.event_preview_key_matches(uuid, uuid)
  to anon, authenticated, service_role;

comment on function public.event_preview_key_matches(uuid, uuid) is
  'Valida el enlace de preview. No revela el preview_key.';

create or replace function public.tickets_propagate_is_test_to_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.order_id is not null and coalesce(new.is_test, false) then
    update public.orders
    set
      is_test = true,
      updated_at = now()
    where id = new.order_id
      and is_test = false;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_propagate_is_test_to_order_trg on public.tickets;
create trigger tickets_propagate_is_test_to_order_trg
after insert or update of is_test
on public.tickets
for each row
execute function public.tickets_propagate_is_test_to_order();

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
  v_next integer;
  v_updated integer := 0;
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

  if coalesce(v_ticket.is_test, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'test_ticket',
      'message', 'TICKET DE PRUEBA - ACCESO DENEGADO',
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
  where id = v_ticket.id
    and status = 'valid'::public.ticket_status
    and admissions_used = v_ticket.admissions_used;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_used',
      'admissions_used', v_ticket.admissions_used,
      'max_admissions', v_ticket.max_admissions
    );
  end if;

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
    'is_test', false,
    'is_test_scan', false,
    'is_sandbox', false
  );
end;
$$;

comment on function public.scan_ticket_admission(uuid, uuid) is
  'Admision atomica. is_test=true se rechaza siempre (TICKET DE PRUEBA - ACCESO DENEGADO).';

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;
