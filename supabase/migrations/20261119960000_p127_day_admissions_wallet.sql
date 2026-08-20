-- P127 · Admisiones por jornada (abonos) + ledger de puerta
-- ABO-2: un abono no se quema en el primer escaneo; un ingreso por day_id.

create table if not exists public.ticket_day_admissions (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  day_id uuid not null references public.event_schedules (id) on delete restrict,
  scanned_at timestamptz not null default now(),
  primary key (ticket_id, day_id)
);

create index if not exists ticket_day_admissions_day_idx
  on public.ticket_day_admissions (day_id, scanned_at desc);

comment on table public.ticket_day_admissions is
  'Un ingreso por (ticket, jornada). Evita que un abono entre dos veces el mismo dia.';

alter table public.ticket_day_admissions enable row level security;
revoke all on table public.ticket_day_admissions from public, anon, authenticated;
grant all on table public.ticket_day_admissions to service_role;

create or replace function public.resolve_current_event_schedule_day(
  p_event_id uuid,
  p_now timestamptz default now()
)
returns uuid
language sql
stable
set search_path = pg_catalog, public
as $$
  select s.id
  from public.event_schedules as s
  where s.event_id = p_event_id
    and p_now >= s.start_time
    and p_now <= s.end_time
  order by s.start_time asc
  limit 1;
$$;

revoke all on function public.resolve_current_event_schedule_day(uuid, timestamptz)
  from public;
grant execute on function public.resolve_current_event_schedule_day(uuid, timestamptz)
  to authenticated, service_role;

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
  v_tier_day uuid;
  v_current_day uuid;
  v_schedule_count integer := 0;
  v_day_inserted integer := 0;
  v_admitted_days integer := 0;
  v_max integer;
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

  if exists (
    select 1
    from public.ticket_transfers as tr
    where tr.original_ticket_id = v_ticket.id
      and tr.status = 'pending'::public.ticket_transfer_status
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'transfer_pending',
      'admissions_used', v_ticket.admissions_used,
      'max_admissions', v_ticket.max_admissions
    );
  end if;

  if public.ticket_has_active_resale_listing(v_ticket.id) then
    return jsonb_build_object(
      'ok', false,
      'code', 'listed_for_resale',
      'admissions_used', v_ticket.admissions_used,
      'max_admissions', v_ticket.max_admissions
    );
  end if;

  if not public.is_ticket_admission_eligible(v_ticket.id) then
    return jsonb_build_object('ok', false, 'code', 'unpaid');
  end if;

  select tt.day_id
    into v_tier_day
  from public.ticket_tiers as tt
  where tt.id = v_ticket.tier_id;

  select count(*)::integer
    into v_schedule_count
  from public.event_schedules as s
  where s.event_id = v_ticket.event_id;

  -- Abono / pase general en evento multi-jornada: un ingreso por dia.
  if v_tier_day is null and coalesce(v_schedule_count, 0) >= 2 then
    v_current_day := public.resolve_current_event_schedule_day(v_ticket.event_id, now());

    if v_current_day is null then
      return jsonb_build_object(
        'ok', false,
        'code', 'outside_window',
        'message', 'Abono fuera de las jornadas habilitadas para ingreso'
      );
    end if;

    insert into public.ticket_day_admissions (ticket_id, day_id, scanned_at)
    values (v_ticket.id, v_current_day, now())
    on conflict (ticket_id, day_id) do nothing;

    get diagnostics v_day_inserted = row_count;
    if v_day_inserted <> 1 then
      return jsonb_build_object(
        'ok', false,
        'code', 'already_used_today',
        'message', 'Este abono ya fue utilizado en la jornada actual',
        'day_id', v_current_day,
        'admissions_used', v_ticket.admissions_used,
        'max_admissions', v_schedule_count
      );
    end if;

    select count(*)::integer
      into v_admitted_days
    from public.ticket_day_admissions as a
    where a.ticket_id = v_ticket.id;

    v_next := v_admitted_days;
    v_max := v_schedule_count;

    update public.tickets
    set
      admissions_used = v_next,
      status = case
        when v_next >= v_max then 'used'::public.ticket_status
        else 'valid'::public.ticket_status
      end,
      scanned_at = case
        when v_next >= v_max then now()
        else scanned_at
      end,
      validated_at = now(),
      validated_by = p_validated_by,
      updated_at = now()
    where id = v_ticket.id
      and status = 'valid'::public.ticket_status;

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      return jsonb_build_object(
        'ok', false,
        'code', 'already_used',
        'admissions_used', v_ticket.admissions_used,
        'max_admissions', v_max
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'code', case when v_next >= v_max then 'complete' else 'partial' end,
      'admissions_used', v_next,
      'max_admissions', v_max,
      'remaining', greatest(0, v_max - v_next),
      'day_id', v_current_day,
      'is_test', false,
      'is_test_scan', false,
      'is_sandbox', false
    );
  end if;

  v_next := v_ticket.admissions_used + 1;
  v_max := greatest(1, v_ticket.max_admissions);

  update public.tickets
  set
    admissions_used = v_next,
    status = case
      when v_next >= v_max then 'used'::public.ticket_status
      else 'valid'::public.ticket_status
    end,
    scanned_at = case
      when v_next >= v_max then now()
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
    'code', case when v_next >= v_max then 'complete' else 'partial' end,
    'admissions_used', v_next,
    'max_admissions', v_max,
    'remaining', greatest(0, v_max - v_next),
    'is_test', false,
    'is_test_scan', false,
    'is_sandbox', false
  );
end;
$$;

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;
