-- P113 · Transferencia por link (WhatsApp)
-- El titular genera un token de reclamo sin email destino. Quien abre el link
-- e inicia sesion puede aceptar, salvo el propio emisor.

alter table public.ticket_transfers
  add column if not exists open_claim boolean not null default false;

create or replace function public.initiate_ticket_share_transfer(
  p_ticket_id uuid
)
returns table (
  transfer_id uuid,
  claim_token text,
  event_title text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_sender uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_transfer_id uuid;
  v_event_title text;
  v_raw_token text;
  v_token_hash text;
  v_secret text;
begin
  if v_sender is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
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
    select 1
    from public.ticket_resale_listings as l
    where l.ticket_id = v_ticket.id
      and l.status = 'active'::public.ticket_resale_listing_status
  ) then
    raise exception 'TICKET_LISTED_FOR_RESALE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.ticket_transfers as tr
    where tr.original_ticket_id = v_ticket.id
      and tr.status = 'pending'::public.ticket_transfer_status
  ) then
    raise exception 'TICKET_TRANSFER_PENDING' using errcode = 'P0001';
  end if;

  select e.title
    into v_event_title
  from public.events as e
  where e.id = v_ticket.event_id
  for update of e;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(
    extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'),
    'hex'
  );
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  update public.tickets
  set
    totp_secret = v_secret,
    updated_at = now()
  where id = v_ticket.id;

  insert into public.ticket_transfers (
    sender_id,
    receiver_email,
    original_ticket_id,
    new_ticket_id,
    status,
    claim_token,
    receiver_id,
    open_claim
  )
  values (
    v_sender,
    'share@tokepass.invalid',
    v_ticket.id,
    null,
    'pending'::public.ticket_transfer_status,
    v_token_hash,
    null,
    true
  )
  returning id into v_transfer_id;

  return query select
    v_transfer_id,
    v_raw_token,
    coalesce(v_event_title, 'Evento Tokepass');
end;
$$;

revoke all on function public.initiate_ticket_share_transfer(uuid) from public;
grant execute on function public.initiate_ticket_share_transfer(uuid)
  to authenticated;

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

  select lower(p.email)
    into v_profile_email
  from public.profiles as p
  where p.id = v_user;

  return query
  select
    tr.id,
    tr.status,
    coalesce(e.title, 'Evento Tokepass'),
    e.date,
    coalesce(e.flyer_url, e.image_url),
    tr.receiver_email,
    case
      when tr.open_claim then (tr.sender_id is distinct from v_user)
      else (v_profile_email is not null and v_profile_email = lower(tr.receiver_email))
    end,
    (t.owner_id is not distinct from v_user)
  from public.ticket_transfers as tr
  join public.tickets as t on t.id = tr.original_ticket_id
  left join public.events as e on e.id = t.event_id
  where tr.claim_token = v_hash
  limit 1;
end;
$$;

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
  v_max_per_user integer;
  v_receiver_count integer;
  v_secret text;
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
    receiver_email = v_email,
    new_ticket_id = v_ticket.id,
    accepted_at = now()
  where id = v_transfer.id
    and status = 'pending'::public.ticket_transfer_status;

  if not found then
    raise exception 'TRANSFER_NOT_PENDING' using errcode = 'P0001';
  end if;

  return query select
    v_transfer.id,
    v_ticket.id,
    coalesce(v_event_title, 'Evento Tokepass');
end;
$$;

comment on function public.initiate_ticket_share_transfer(uuid) is
  'Inicia un envio por link: rota totp, oculta Living QR y devuelve token de reclamo.';
