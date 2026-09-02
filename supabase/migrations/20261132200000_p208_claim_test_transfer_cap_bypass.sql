-- P208 · El tope max_tickets_per_user en reclamos de transferencia
-- solo aplica a entradas reales (is_test = false) de eventos publicados.
-- Tickets de prueba, borradores y cuentas admin/super_admin no cuentan
-- contra el cupo (permite testeos masivos de claim).

create or replace function public.should_enforce_transfer_ticket_cap(
  p_ticket_is_test boolean,
  p_event_status public.event_status,
  p_receiver_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    coalesce(p_ticket_is_test, false) = false
    and p_event_status = 'published'::public.event_status
    and not exists (
      select 1
      from public.profiles as p
      where p.id = p_receiver_id
        and p.role::text in ('admin', 'super_admin')
    );
$$;

comment on function public.should_enforce_transfer_ticket_cap(boolean, public.event_status, uuid) is
  'Tope por persona solo para tickets reales en eventos published. Admin/super_admin y is_test no cuentan.';

revoke all on function public.should_enforce_transfer_ticket_cap(boolean, public.event_status, uuid)
  from public;
grant execute on function public.should_enforce_transfer_ticket_cap(boolean, public.event_status, uuid)
  to authenticated, service_role;

create or replace function public.claim_ticket_transfer_by_token(p_token text)
returns table (
  transfer_id uuid,
  ticket_id uuid,
  event_title text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_user uuid := auth.uid();
  v_hash text;
  v_email text;
  v_holder_name text;
  v_holder_dni text;
  v_transfer public.ticket_transfers%rowtype;
  v_ticket public.tickets%rowtype;
  v_event_title text;
  v_event_status public.event_status;
  v_max_per_user integer;
  v_receiver_count integer;
  v_secret text;
  v_new_ticket_id uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_token, ''))) < 16 then
    raise exception 'INVALID_CLAIM_TOKEN' using errcode = '22023';
  end if;

  v_hash := encode(
    extensions.digest(convert_to(btrim(p_token), 'UTF8'), 'sha256'),
    'hex'
  );

  select lower(p.email), p.full_name, p.dni
    into v_email, v_holder_name, v_holder_dni
  from public.profiles as p
  where p.id = v_user;

  if v_email is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_transfer
  from public.ticket_transfers as tr
  where tr.claim_token = v_hash;

  if not found then
    raise exception 'TRANSFER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_transfer.status = 'pending'::public.ticket_transfer_status
     and v_transfer.expires_at is not null
     and v_transfer.expires_at <= now() then
    perform public.expire_one_pending_ticket_transfer(v_transfer.id);
    raise exception 'TRANSFER_EXPIRED' using errcode = 'P0001';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = v_transfer.original_ticket_id
  for update of t;

  if not found then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_transfer
  from public.ticket_transfers as tr
  where tr.id = v_transfer.id
  for update of tr;

  if v_transfer.status = 'accepted'::public.ticket_transfer_status
     and v_transfer.receiver_id is not distinct from v_user then
    select coalesce(e.title, 'Evento Tokepass')
      into v_event_title
    from public.events as e
    where e.id = v_ticket.event_id;

    return query select
      v_transfer.id,
      coalesce(v_transfer.new_ticket_id, v_ticket.id),
      v_event_title;
    return;
  end if;

  if v_transfer.status = 'cancelled'::public.ticket_transfer_status then
    raise exception 'TRANSFER_CANCELLED' using errcode = 'P0001';
  end if;
  if v_transfer.status <> 'pending'::public.ticket_transfer_status then
    raise exception 'TRANSFER_NOT_PENDING' using errcode = 'P0001';
  end if;
  if v_transfer.expires_at is not null and v_transfer.expires_at <= now() then
    perform public.expire_one_pending_ticket_transfer(v_transfer.id);
    raise exception 'TRANSFER_EXPIRED' using errcode = 'P0001';
  end if;
  if not v_transfer.open_claim
     and lower(v_transfer.receiver_email) is distinct from v_email then
    raise exception 'EMAIL_MISMATCH' using errcode = '42501';
  end if;
  if v_ticket.owner_id is not distinct from v_user then
    raise exception 'CANNOT_TRANSFER_TO_SELF' using errcode = '23514';
  end if;
  if v_ticket.status::text <> 'valid' then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;
  if coalesce(v_ticket.admissions_used, 0) > 0 then
    raise exception 'TICKET_ALREADY_ADMITTED' using errcode = '23514';
  end if;
  if v_ticket.owner_id is distinct from v_transfer.sender_id then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;
  if v_ticket.transfer_count >= v_ticket.max_transfers_allowed then
    raise exception 'TRANSFER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  select e.title, e.status, coalesce(e.max_tickets_per_user, 10)
    into v_event_title, v_event_status, v_max_per_user
  from public.events as e
  where e.id = v_ticket.event_id
  for update of e;

  if public.should_enforce_transfer_ticket_cap(
    coalesce(v_ticket.is_test, false),
    v_event_status,
    v_user
  ) then
    select count(*)::integer
      into v_receiver_count
    from public.tickets as t
    where t.event_id = v_ticket.event_id
      and t.owner_id = v_user
      and coalesce(t.is_test, false) = false
      and t.status in (
        'valid'::public.ticket_status,
        'pending_payment'::public.ticket_status
      );

    if v_receiver_count >= v_max_per_user then
      raise exception 'MAX_TICKETS_PER_USER_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;

  update public.tickets
  set
    status = 'transferred'::public.ticket_status,
    seat_id = null,
    seating_unit_id = null,
    totp_secret = 'xfer_dead_' || replace(gen_random_uuid()::text, '-', ''),
    updated_at = now()
  where id = v_ticket.id
    and owner_id = v_transfer.sender_id
    and status = 'valid'::public.ticket_status;

  if not found then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.tickets (
    event_id,
    tier_id,
    owner_id,
    qr_code,
    status,
    order_id,
    seat_id,
    seating_unit_id,
    max_admissions,
    admissions_used,
    is_dynamic_qr,
    totp_secret,
    max_transfers_allowed,
    transfer_count,
    transferred_from_id,
    holder_name,
    holder_email,
    holder_dni,
    group_id,
    group_slot,
    batch_id,
    is_test,
    ticket_type,
    phase_id
  )
  values (
    v_ticket.event_id,
    v_ticket.tier_id,
    v_user,
    'xfer_' || replace(gen_random_uuid()::text, '-', ''),
    'valid'::public.ticket_status,
    v_ticket.order_id,
    v_ticket.seat_id,
    v_ticket.seating_unit_id,
    v_ticket.max_admissions,
    0,
    coalesce(v_ticket.is_dynamic_qr, true),
    v_secret,
    v_ticket.max_transfers_allowed,
    v_ticket.transfer_count + 1,
    v_ticket.id,
    coalesce(nullif(btrim(v_holder_name), ''), v_ticket.holder_name),
    v_email,
    coalesce(v_holder_dni, v_ticket.holder_dni),
    v_ticket.group_id,
    v_ticket.group_slot,
    v_ticket.batch_id,
    coalesce(v_ticket.is_test, false),
    v_ticket.ticket_type,
    v_ticket.phase_id
  )
  returning id into v_new_ticket_id;

  update public.ticket_transfers
  set
    status = 'accepted'::public.ticket_transfer_status,
    receiver_id = v_user,
    receiver_email = v_email,
    new_ticket_id = v_new_ticket_id,
    accepted_at = now()
  where id = v_transfer.id
    and status = 'pending'::public.ticket_transfer_status;

  if not found then
    raise exception 'TRANSFER_NOT_PENDING' using errcode = 'P0001';
  end if;

  return query select
    v_transfer.id,
    v_new_ticket_id,
    coalesce(v_event_title, 'Evento Tokepass');
end;
$$;

comment on function public.claim_ticket_transfer_by_token(text) is
  'Reclamo de cesion/share. El tope por persona no aplica a is_test, eventos no published ni admin/super_admin.';
