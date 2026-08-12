-- =============================================================================
-- P27: Isolate draft/test tickets from live door validation
-- =============================================================================

alter table public.tickets
  add column if not exists is_test boolean not null default false;

comment on column public.tickets.is_test is
  'Entrada generada en borrador/preview. Nunca válida en un evento published.';

create index if not exists tickets_event_is_test_idx
  on public.tickets (event_id)
  where is_test = true;

-- Force is_test on every insert while the event is still a draft (zero-trust).
create or replace function public.tickets_force_is_test_on_draft()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.event_status;
begin
  select e.status
    into v_status
  from public.events as e
  where e.id = new.event_id;

  if v_status = 'draft'::public.event_status then
    new.is_test := true;
  elsif new.is_test is null then
    new.is_test := false;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_force_is_test_on_draft_trg on public.tickets;
create trigger tickets_force_is_test_on_draft_trg
  before insert on public.tickets
  for each row
  execute function public.tickets_force_is_test_on_draft();

-- Door scan RPC: reject test tickets once the event is live.
create or replace function public.scan_ticket_admission(
  p_ticket_id uuid,
  p_validated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_ticket public.tickets%rowtype;
  v_event_status public.event_status;
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

  if coalesce(v_ticket.is_test, false)
     and v_event_status = 'published'::public.event_status then
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
      and v_event_status = 'draft'::public.event_status
  );
end;
$$;

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;

-- Purge draft/test tickets when publishing (organizer or service_role).
create or replace function public.purge_event_test_tickets(
  p_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_organizer_id uuid;
  v_deleted integer := 0;
begin
  if p_event_id is null then
    raise exception 'event_id requerido' using errcode = '22023';
  end if;

  select e.organizer_id
    into v_organizer_id
  from public.events as e
  where e.id = p_event_id;

  if v_organizer_id is null then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from v_organizer_id
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  delete from public.tickets as t
  where t.event_id = p_event_id
    and t.is_test = true;

  get diagnostics v_deleted = row_count;
  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.purge_event_test_tickets(uuid) from public;
revoke all on function public.purge_event_test_tickets(uuid) from anon;
grant execute on function public.purge_event_test_tickets(uuid)
  to authenticated, service_role;
