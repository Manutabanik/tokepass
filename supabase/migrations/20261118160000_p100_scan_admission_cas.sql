-- P100 · Doble escaneo: UPDATE condicional (CAS) sobre status + admissions_used.
-- FOR UPDATE ya serializa; el WHERE evita un segundo admit si el row cambio.

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

comment on function public.scan_ticket_admission(uuid, uuid) is
  'Admision atomica: FOR UPDATE + UPDATE WHERE status=valid AND admissions_used no cambio.';

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;
