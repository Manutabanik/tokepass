-- P108: PIN de control de acceso (staff guest 24h) + service_role en admision.

create table if not exists public.event_door_access_pins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  pin_hash text not null,
  pin_lookup text not null,
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_redeemed_at timestamptz
);

create unique index if not exists event_door_access_pins_lookup_active
  on public.event_door_access_pins (pin_lookup)
  where revoked_at is null;

create index if not exists event_door_access_pins_event_active
  on public.event_door_access_pins (event_id, expires_at desc)
  where revoked_at is null;

comment on table public.event_door_access_pins is
  'PIN de 6 digitos para staff de puerta sin cuenta. Solo service_role.';

alter table public.event_door_access_pins enable row level security;

revoke all on table public.event_door_access_pins from public, anon, authenticated;
grant all on table public.event_door_access_pins to service_role;

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
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if not v_is_service then
    if auth.uid() is null
       or auth.uid() is distinct from p_validated_by then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not v_is_service then
    if not public.user_is_event_organizer_or_staff(
      v_ticket.event_id,
      p_validated_by,
      array['door_staff'::public.event_staff_role]
    ) then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
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
        when v_ticket.status = 'cancelled'::public.ticket_status
          or v_ticket.status = 'revoked'::public.ticket_status
          then 'cancelled'
        when v_ticket.status = 'transferred'::public.ticket_status
          then 'transferred'
        when v_ticket.status = 'pending_payment'::public.ticket_status
          then 'unpaid'
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
  'Admision atomica. service_role permitido para sesion PIN de puerta. is_test se rechaza siempre.';

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;
