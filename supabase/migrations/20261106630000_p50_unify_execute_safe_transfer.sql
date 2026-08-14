-- =============================================================================
-- P50: Unificar execute_safe_transfer (eliminar sobrecarga ambigüa)
-- PostgREST falla con: "Could not choose the best candidate function"
-- al existir firmas (uuid,text) y (uuid,text,uuid) a la vez.
-- =============================================================================

drop function if exists public.execute_safe_transfer(uuid, text);
drop function if exists public.execute_safe_transfer(uuid, text, uuid);

create function public.execute_safe_transfer(
  p_ticket_id uuid,
  p_receiver_email text,
  p_acting_seller_id uuid default null
)
returns table (
  transfer_id uuid,
  new_ticket_id uuid,
  event_title text,
  receiver_email text,
  receiver_user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_sender uuid;
  v_ticket public.tickets%rowtype;
  v_email text;
  v_receiver_id uuid;
  v_new_ticket_id uuid;
  v_transfer_id uuid;
  v_event_title text;
  v_secret text;
  v_max_per_user integer;
  v_receiver_count integer;
begin
  if coalesce(auth.role(), '') = 'service_role' and p_acting_seller_id is not null then
    v_sender := p_acting_seller_id;
  else
    v_sender := auth.uid();
  end if;

  if v_sender is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_email := lower(btrim(coalesce(p_receiver_email, '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_RECEIVER_EMAIL' using errcode = '22023';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ticket.owner_id is distinct from v_sender then
    raise exception 'NOT_TICKET_OWNER' using errcode = '42501';
  end if;
  if v_ticket.status::text <> 'valid' then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;
  if v_ticket.transfer_count >= v_ticket.max_transfers_allowed then
    raise exception 'TRANSFER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles as p
    where p.id = v_sender and lower(p.email) = v_email
  ) then
    raise exception 'CANNOT_TRANSFER_TO_SELF' using errcode = '23514';
  end if;

  select p.id into v_receiver_id
  from public.profiles as p
  where lower(p.email) = v_email
  limit 1;

  select e.title, coalesce(e.max_tickets_per_user, 10)
    into v_event_title, v_max_per_user
  from public.events as e
  where e.id = v_ticket.event_id
  for update of e;

  if v_receiver_id is not null then
    select count(*)::integer
      into v_receiver_count
    from public.tickets as t
    where t.event_id = v_ticket.event_id
      and t.owner_id = v_receiver_id
      and t.status in (
        'valid'::public.ticket_status,
        'pending_payment'::public.ticket_status
      );

    if v_receiver_count >= v_max_per_user then
      raise exception 'MAX_TICKETS_PER_USER_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;

  -- Cancelar listing activo (regalo); el webhook de reventa usa service_role.
  update public.ticket_resale_listings as l
  set
    status = 'cancelled'::public.ticket_resale_listing_status,
    updated_at = now()
  where l.ticket_id = v_ticket.id
    and l.status = 'active'::public.ticket_resale_listing_status
    and coalesce(auth.role(), '') <> 'service_role';

  update public.tickets
  set
    status = 'transferred'::public.ticket_status,
    seat_id = null,
    seating_unit_id = null,
    totp_secret = 'xfer_dead_' || replace(gen_random_uuid()::text, '-', ''),
    updated_at = now()
  where id = v_ticket.id;

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
    holder_dni
  )
  values (
    v_ticket.event_id,
    v_ticket.tier_id,
    v_receiver_id,
    'xfer_' || replace(gen_random_uuid()::text, '-', ''),
    'valid'::public.ticket_status,
    v_ticket.order_id,
    v_ticket.seat_id,
    v_ticket.seating_unit_id,
    v_ticket.max_admissions,
    v_ticket.admissions_used,
    coalesce(v_ticket.is_dynamic_qr, true),
    v_secret,
    v_ticket.max_transfers_allowed,
    v_ticket.transfer_count + 1,
    v_ticket.id,
    v_ticket.holder_name,
    v_email,
    v_ticket.holder_dni
  )
  returning id into v_new_ticket_id;

  insert into public.ticket_transfers (
    sender_id,
    receiver_email,
    original_ticket_id,
    new_ticket_id
  )
  values (
    v_sender,
    v_email,
    v_ticket.id,
    v_new_ticket_id
  )
  returning id into v_transfer_id;

  return query select
    v_transfer_id,
    v_new_ticket_id,
    coalesce(v_event_title, 'Evento Tokepass'),
    v_email,
    v_receiver_id;
end;
$$;

revoke all on function public.execute_safe_transfer(uuid, text, uuid) from public;
grant execute on function public.execute_safe_transfer(uuid, text, uuid)
  to authenticated, service_role;

comment on function public.execute_safe_transfer(uuid, text, uuid) is
  'Transferencia atómica de ticket. p_acting_seller_id solo para service_role (reventa). Una sola firma — sin sobrecargas.';
