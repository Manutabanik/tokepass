-- =============================================================================
-- P82: Transferencia asíncrona de entradas (pending / claim / cancel)
-- Gift flow: mismo ticket, titular bloqueado, Living QR oculto hasta claim
-- o revocación. execute_safe_transfer queda para reventa (inmediata).
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type as t
    join pg_namespace as n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ticket_transfer_status'
  ) then
    create type public.ticket_transfer_status as enum (
      'pending',
      'accepted',
      'cancelled'
    );
  end if;
end
$$;

alter table public.ticket_transfers
  add column if not exists status public.ticket_transfer_status;

alter table public.ticket_transfers
  add column if not exists claim_token text;

alter table public.ticket_transfers
  add column if not exists receiver_id uuid references public.profiles(id)
    on delete set null;

alter table public.ticket_transfers
  add column if not exists accepted_at timestamptz;

alter table public.ticket_transfers
  add column if not exists cancelled_at timestamptz;

update public.ticket_transfers
set
  status = 'accepted'::public.ticket_transfer_status,
  accepted_at = coalesce(accepted_at, created_at)
where status is null;

alter table public.ticket_transfers
  alter column status set default 'accepted'::public.ticket_transfer_status;

alter table public.ticket_transfers
  alter column status set not null;

create unique index if not exists ticket_transfers_one_pending_per_ticket
  on public.ticket_transfers (original_ticket_id)
  where status = 'pending'::public.ticket_transfer_status;

create unique index if not exists ticket_transfers_claim_token_uidx
  on public.ticket_transfers (claim_token)
  where claim_token is not null;

create index if not exists ticket_transfers_pending_receiver_email_idx
  on public.ticket_transfers (lower(receiver_email))
  where status = 'pending'::public.ticket_transfer_status;

-- -----------------------------------------------------------------------------
-- Admission: un ticket con transferencia pendiente no entra en puerta
-- -----------------------------------------------------------------------------
create or replace function public.ticket_has_pending_transfer(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.ticket_transfers as tr
    where tr.original_ticket_id = p_ticket_id
      and tr.status = 'pending'::public.ticket_transfer_status
  );
$$;

revoke all on function public.ticket_has_pending_transfer(uuid) from public;
grant execute on function public.ticket_has_pending_transfer(uuid)
  to authenticated, service_role;

create or replace function public.is_ticket_admission_eligible(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tickets as t
    left join public.orders as o on o.id = t.order_id
    where t.id = p_ticket_id
      and t.status = 'valid'::public.ticket_status
      and not exists (
        select 1
        from public.ticket_transfers as tr
        where tr.original_ticket_id = t.id
          and tr.status = 'pending'::public.ticket_transfer_status
      )
      and (
        (t.order_id is not null and o.status = 'paid')
        or (
          t.order_id is null
          and exists (
            select 1
            from public.guest_list_entries as g
            where g.ticket_id = t.id
          )
        )
      )
  );
$$;

revoke all on function public.is_ticket_admission_eligible(uuid) from public;
grant execute on function public.is_ticket_admission_eligible(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- execute_safe_transfer: bloquear si hay gift pendiente; marcar accepted
-- -----------------------------------------------------------------------------
create or replace function public.execute_safe_transfer(
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
    select 1
    from public.ticket_transfers as tr
    where tr.original_ticket_id = v_ticket.id
      and tr.status = 'pending'::public.ticket_transfer_status
  ) then
    raise exception 'TICKET_TRANSFER_PENDING' using errcode = 'P0001';
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
    new_ticket_id,
    status,
    receiver_id,
    accepted_at
  )
  values (
    v_sender,
    v_email,
    v_ticket.id,
    v_new_ticket_id,
    'accepted'::public.ticket_transfer_status,
    v_receiver_id,
    now()
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

-- -----------------------------------------------------------------------------
-- Gift: iniciar (bloquea QR, no cambia owner_id)
-- -----------------------------------------------------------------------------
create or replace function public.initiate_ticket_transfer(
  p_ticket_id uuid,
  p_receiver_email text
)
returns table (
  transfer_id uuid,
  claim_token text,
  event_title text,
  receiver_email text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_sender uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_email text;
  v_receiver_id uuid;
  v_transfer_id uuid;
  v_event_title text;
  v_raw_token text;
  v_token_hash text;
  v_secret text;
  v_max_per_user integer;
  v_receiver_count integer;
begin
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
    receiver_id
  )
  values (
    v_sender,
    v_email,
    v_ticket.id,
    null,
    'pending'::public.ticket_transfer_status,
    v_token_hash,
    v_receiver_id
  )
  returning id into v_transfer_id;

  return query select
    v_transfer_id,
    v_raw_token,
    coalesce(v_event_title, 'Evento Tokepass'),
    v_email;
end;
$$;

revoke all on function public.initiate_ticket_transfer(uuid, text) from public;
grant execute on function public.initiate_ticket_transfer(uuid, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Gift: cancelar (revoca el claim, Living QR vuelve al emisor)
-- -----------------------------------------------------------------------------
create or replace function public.cancel_ticket_transfer(p_transfer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_sender uuid := auth.uid();
  v_ticket_id uuid;
  v_transfer public.ticket_transfers%rowtype;
  v_ticket public.tickets%rowtype;
  v_secret text;
begin
  if v_sender is null then
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
  if v_transfer.sender_id is distinct from v_sender then
    raise exception 'NOT_TRANSFER_SENDER' using errcode = '42501';
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
    and owner_id = v_sender
    and status = 'valid'::public.ticket_status;

  return true;
end;
$$;

revoke all on function public.cancel_ticket_transfer(uuid) from public;
grant execute on function public.cancel_ticket_transfer(uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Gift: peek (UI de /claim) — no muta
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Gift: reclamar — reasigna owner_id en la misma transacción
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

revoke all on function public.claim_ticket_transfer_by_token(text) from public;
grant execute on function public.claim_ticket_transfer_by_token(text)
  to authenticated;

comment on function public.initiate_ticket_transfer(uuid, text) is
  'Inicia un regalo asíncrono: bloquea Living QR (rota totp) sin cambiar owner_id.';
comment on function public.cancel_ticket_transfer(uuid) is
  'Revoca un gift pendiente. El emisor recupera el QR. Falla si ya fue reclamado.';
comment on function public.claim_ticket_transfer_by_token(text) is
  'Reclama un gift por token. Reasigna owner_id y marca accepted en una sola TX.';
