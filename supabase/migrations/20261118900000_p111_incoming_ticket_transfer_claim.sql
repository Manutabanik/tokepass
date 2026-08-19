-- P111: Incoming gift transfers visible + claimable from Mis Entradas
-- Recipients cannot SELECT tickets they do not own (RLS), so listing and
-- claim/reject by transfer id must run as SECURITY DEFINER.

-- -----------------------------------------------------------------------------
-- List pending gifts addressed to the authenticated user's email
-- -----------------------------------------------------------------------------
create or replace function public.list_incoming_pending_ticket_transfers()
returns table (
  transfer_id uuid,
  ticket_id uuid,
  receiver_email text,
  event_id uuid,
  event_title text,
  event_date timestamptz,
  event_location text,
  flyer_url text,
  tier_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select lower(nullif(btrim(coalesce(p.email, '')), ''))
    into v_email
  from public.profiles as p
  where p.id = v_user;

  if v_email is null then
    v_email := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  end if;

  if v_email is null then
    return;
  end if;

  return query
  select
    tr.id,
    t.id,
    tr.receiver_email,
    e.id,
    coalesce(e.title, 'Evento Tokepass'),
    e.date,
    coalesce(e.location, ''),
    coalesce(e.flyer_url, e.image_url),
    coalesce(tt.name, 'Entrada'),
    tr.created_at
  from public.ticket_transfers as tr
  join public.tickets as t on t.id = tr.original_ticket_id
  left join public.events as e on e.id = t.event_id
  left join public.ticket_tiers as tt on tt.id = t.tier_id
  where tr.status = 'pending'::public.ticket_transfer_status
    and lower(tr.receiver_email) = v_email
    and tr.sender_id is distinct from v_user
  order by tr.created_at desc;
end;
$$;

revoke all on function public.list_incoming_pending_ticket_transfers() from public;
grant execute on function public.list_incoming_pending_ticket_transfers()
  to authenticated;

-- -----------------------------------------------------------------------------
-- Shared claim body (by transfer row already locked)
-- -----------------------------------------------------------------------------
create or replace function public.claim_ticket_transfer_as_receiver(p_transfer_id uuid)
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
  v_email text;
  v_holder_name text;
  v_holder_dni text;
  v_transfer public.ticket_transfers%rowtype;
  v_ticket public.tickets%rowtype;
  v_event_title text;
  v_max_per_user integer;
  v_receiver_count integer;
  v_secret text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select
    lower(nullif(btrim(coalesce(p.email, '')), '')),
    p.full_name,
    p.dni
    into v_email, v_holder_name, v_holder_dni
  from public.profiles as p
  where p.id = v_user;

  if v_email is null then
    v_email := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  end if;

  if v_email is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = (
    select tr.original_ticket_id
    from public.ticket_transfers as tr
    where tr.id = p_transfer_id
  )
  for update of t;

  if not found then
    raise exception 'TRANSFER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_transfer
  from public.ticket_transfers as tr
  where tr.id = p_transfer_id
  for update of tr;

  if not found then
    raise exception 'TRANSFER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_transfer.status = 'accepted'::public.ticket_transfer_status
     and v_ticket.owner_id is not distinct from v_user then
    select coalesce(e.title, 'Evento Tokepass')
      into v_event_title
    from public.events as e
    where e.id = v_ticket.event_id;

    return query select
      v_transfer.id,
      v_ticket.id,
      v_event_title;
    return;
  end if;

  if v_transfer.status = 'cancelled'::public.ticket_transfer_status then
    raise exception 'TRANSFER_CANCELLED' using errcode = 'P0001';
  end if;
  if v_transfer.status <> 'pending'::public.ticket_transfer_status then
    raise exception 'TRANSFER_NOT_PENDING' using errcode = 'P0001';
  end if;
  if lower(v_transfer.receiver_email) is distinct from v_email then
    raise exception 'EMAIL_MISMATCH' using errcode = '42501';
  end if;
  if v_ticket.owner_id is not distinct from v_user then
    raise exception 'CANNOT_TRANSFER_TO_SELF' using errcode = '23514';
  end if;
  if v_ticket.status::text <> 'valid' then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;
  if v_ticket.owner_id is distinct from v_transfer.sender_id then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;
  if v_ticket.transfer_count >= v_ticket.max_transfers_allowed then
    raise exception 'TRANSFER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  select e.title, coalesce(e.max_tickets_per_user, 10)
    into v_event_title, v_max_per_user
  from public.events as e
  where e.id = v_ticket.event_id
  for update of e;

  select count(*)::integer
    into v_receiver_count
  from public.tickets as t
  where t.event_id = v_ticket.event_id
    and t.owner_id = v_user
    and t.status in (
      'valid'::public.ticket_status,
      'pending_payment'::public.ticket_status
    );

  if v_receiver_count >= v_max_per_user then
    raise exception 'MAX_TICKETS_PER_USER_EXCEEDED' using errcode = 'P0001';
  end if;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  update public.tickets
  set
    owner_id = v_user,
    transfer_count = v_ticket.transfer_count + 1,
    holder_email = v_email,
    holder_name = coalesce(nullif(btrim(v_holder_name), ''), v_ticket.holder_name),
    holder_dni = coalesce(v_holder_dni, v_ticket.holder_dni),
    totp_secret = v_secret,
    updated_at = now()
  where id = v_ticket.id
    and owner_id = v_transfer.sender_id
    and status = 'valid'::public.ticket_status;

  if not found then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;

  update public.ticket_transfers
  set
    status = 'accepted'::public.ticket_transfer_status,
    receiver_id = v_user,
    new_ticket_id = v_ticket.id,
    accepted_at = now(),
    claim_token = null
  where id = v_transfer.id
    and status = 'pending'::public.ticket_transfer_status;

  if not found then
    raise exception 'TRANSFER_NOT_PENDING' using errcode = 'P0001';
  end if;

  -- Keep profile email in sync when it was empty
  update public.profiles
  set email = v_email
  where id = v_user
    and (email is null or btrim(email) = '');

  return query select
    v_transfer.id,
    v_ticket.id,
    coalesce(v_event_title, 'Evento Tokepass');
end;
$$;

revoke all on function public.claim_ticket_transfer_as_receiver(uuid) from public;
grant execute on function public.claim_ticket_transfer_as_receiver(uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Recipient rejects a pending gift (mirrors sender cancel for the ticket QR)
-- -----------------------------------------------------------------------------
create or replace function public.reject_ticket_transfer_as_receiver(p_transfer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_ticket_id uuid;
  v_transfer public.ticket_transfers%rowtype;
  v_ticket public.tickets%rowtype;
  v_secret text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select lower(nullif(btrim(coalesce(p.email, '')), ''))
    into v_email
  from public.profiles as p
  where p.id = v_user;

  if v_email is null then
    v_email := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  end if;

  if v_email is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select tr.original_ticket_id
    into v_ticket_id
  from public.ticket_transfers as tr
  where tr.id = p_transfer_id;

  if v_ticket_id is null then
    raise exception 'TRANSFER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = v_ticket_id
  for update of t;

  select *
    into v_transfer
  from public.ticket_transfers as tr
  where tr.id = p_transfer_id
  for update of tr;

  if not found then
    raise exception 'TRANSFER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if lower(v_transfer.receiver_email) is distinct from v_email then
    raise exception 'EMAIL_MISMATCH' using errcode = '42501';
  end if;
  if v_transfer.status <> 'pending'::public.ticket_transfer_status then
    raise exception 'TRANSFER_NOT_PENDING' using errcode = 'P0001';
  end if;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  update public.ticket_transfers
  set
    status = 'cancelled'::public.ticket_transfer_status,
    cancelled_at = now(),
    claim_token = null
  where id = v_transfer.id;

  update public.tickets
  set
    totp_secret = v_secret,
    updated_at = now()
  where id = v_ticket.id
    and owner_id = v_transfer.sender_id
    and status = 'valid'::public.ticket_status;

  return true;
end;
$$;

revoke all on function public.reject_ticket_transfer_as_receiver(uuid) from public;
grant execute on function public.reject_ticket_transfer_as_receiver(uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Harden token claim: auth email fallback + clear claim_token on accept
-- -----------------------------------------------------------------------------
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
  v_transfer_id uuid;
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

  select tr.id
    into v_transfer_id
  from public.ticket_transfers as tr
  where tr.claim_token = v_hash;

  if v_transfer_id is null then
    raise exception 'TRANSFER_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  select *
  from public.claim_ticket_transfer_as_receiver(v_transfer_id);
end;
$$;

revoke all on function public.claim_ticket_transfer_by_token(text) from public;
grant execute on function public.claim_ticket_transfer_by_token(text)
  to authenticated;

comment on function public.list_incoming_pending_ticket_transfers() is
  'Lista regalos pendientes dirigidos al email del usuario autenticado.';
comment on function public.claim_ticket_transfer_as_receiver(uuid) is
  'Reclama un gift pendiente por transfer_id (email debe coincidir). SECURITY DEFINER.';
comment on function public.reject_ticket_transfer_as_receiver(uuid) is
  'Rechaza un gift pendiente; el emisor recupera el Living QR.';

-- Peek: same auth email fallback so /claim matches Mis Entradas
create or replace function public.peek_ticket_transfer_claim(p_token text)
returns table (
  transfer_id uuid,
  status public.ticket_transfer_status,
  event_title text,
  event_date timestamptz,
  flyer_url text,
  receiver_email text,
  email_matches boolean,
  already_owner boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_user uuid := auth.uid();
  v_hash text;
  v_profile_email text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_token, ''))) < 16 then
    return;
  end if;

  v_hash := encode(
    extensions.digest(convert_to(btrim(p_token), 'UTF8'), 'sha256'),
    'hex'
  );

  select lower(nullif(btrim(coalesce(p.email, '')), ''))
    into v_profile_email
  from public.profiles as p
  where p.id = v_user;

  if v_profile_email is null then
    v_profile_email := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  end if;

  return query
  select
    tr.id,
    tr.status,
    coalesce(e.title, 'Evento Tokepass'),
    e.date,
    coalesce(e.flyer_url, e.image_url),
    tr.receiver_email,
    (v_profile_email is not null and v_profile_email = lower(tr.receiver_email)),
    (t.owner_id is not distinct from v_user)
  from public.ticket_transfers as tr
  join public.tickets as t on t.id = tr.original_ticket_id
  left join public.events as e on e.id = t.event_id
  where tr.claim_token = v_hash
  limit 1;
end;
$$;

revoke all on function public.peek_ticket_transfer_claim(text) from public;
grant execute on function public.peek_ticket_transfer_claim(text)
  to authenticated;