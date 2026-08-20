-- P116 · Clickwrap auditado + TTL 24h de cesiones pendientes
-- El cron expire-orders llama expire_pending_ticket_transfers.

alter table public.ticket_transfers
  add column if not exists expires_at timestamptz;

comment on column public.ticket_transfers.expires_at is
  'Vencimiento del token de reclamo. Null = legado sin TTL.';

update public.ticket_transfers
set expires_at = created_at + interval '24 hours'
where status = 'pending'::public.ticket_transfer_status
  and expires_at is null;

create index if not exists ticket_transfers_pending_expires_idx
  on public.ticket_transfers (expires_at)
  where status = 'pending'::public.ticket_transfer_status
    and expires_at is not null;

-- -----------------------------------------------------------------------------
-- Auditoria legal
-- -----------------------------------------------------------------------------
create table if not exists public.ticket_action_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  action text not null check (action in ('transfer', 'resale')),
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  transfer_id uuid references public.ticket_transfers (id) on delete set null,
  listing_id uuid references public.ticket_resale_listings (id) on delete set null
);

create index if not exists ticket_action_consents_user_idx
  on public.ticket_action_consents (user_id, accepted_at desc);

create index if not exists ticket_action_consents_ticket_idx
  on public.ticket_action_consents (ticket_id, action);

comment on table public.ticket_action_consents is
  'Clickwrap persistido: user, ticket, version de terminos y timestamp.';

alter table public.ticket_action_consents enable row level security;

drop policy if exists ticket_action_consents_select_own
  on public.ticket_action_consents;
create policy ticket_action_consents_select_own
on public.ticket_action_consents
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_super_admin())
);

revoke insert, update, delete on public.ticket_action_consents
  from public, anon, authenticated;
grant select on public.ticket_action_consents to authenticated;
grant all on public.ticket_action_consents to service_role;

create or replace function public.record_ticket_action_consent(
  p_user_id uuid,
  p_ticket_id uuid,
  p_action text,
  p_terms_version text,
  p_transfer_id uuid default null,
  p_listing_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_version text := btrim(coalesce(p_terms_version, ''));
begin
  if v_version = '' then
    raise exception 'CONSENT_REQUIRED' using errcode = '23514';
  end if;
  if p_action not in ('transfer', 'resale') then
    raise exception 'CONSENT_REQUIRED' using errcode = '23514';
  end if;

  insert into public.ticket_action_consents (
    user_id,
    ticket_id,
    action,
    terms_version,
    transfer_id,
    listing_id
  )
  values (
    p_user_id,
    p_ticket_id,
    p_action,
    v_version,
    p_transfer_id,
    p_listing_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_ticket_action_consent(uuid, uuid, text, text, uuid, uuid)
  from public;

-- -----------------------------------------------------------------------------
-- Expirar una cesion pendiente: cancela + rota TOTP (QR vuelve al titular)
-- -----------------------------------------------------------------------------
create or replace function public.expire_one_pending_ticket_transfer(
  p_transfer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_ticket_id uuid;
  v_ticket public.tickets%rowtype;
  v_transfer public.ticket_transfers%rowtype;
  v_secret text;
begin
  select tr.original_ticket_id
    into v_ticket_id
  from public.ticket_transfers as tr
  where tr.id = p_transfer_id;

  if v_ticket_id is null then
    return false;
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
    return false;
  end if;
  if v_transfer.status <> 'pending'::public.ticket_transfer_status then
    return false;
  end if;
  if v_transfer.expires_at is null or v_transfer.expires_at > now() then
    return false;
  end if;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  update public.ticket_transfers
  set
    status = 'cancelled'::public.ticket_transfer_status,
    cancelled_at = now(),
    claim_token = null
  where id = v_transfer.id
    and status = 'pending'::public.ticket_transfer_status;

  if not found then
    return false;
  end if;

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

revoke all on function public.expire_one_pending_ticket_transfer(uuid) from public;
grant execute on function public.expire_one_pending_ticket_transfer(uuid)
  to service_role;

create or replace function public.expire_pending_ticket_transfers()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select tr.id
    from public.ticket_transfers as tr
    where tr.status = 'pending'::public.ticket_transfer_status
      and tr.expires_at is not null
      and tr.expires_at <= now()
    order by tr.expires_at
    limit 500
  loop
    if public.expire_one_pending_ticket_transfer(v_row.id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_pending_ticket_transfers() from public;
grant execute on function public.expire_pending_ticket_transfers()
  to service_role;

-- -----------------------------------------------------------------------------
-- Share transfer: consentimiento + TTL 24h
-- -----------------------------------------------------------------------------
drop function if exists public.initiate_ticket_share_transfer(uuid);

create or replace function public.initiate_ticket_share_transfer(
  p_ticket_id uuid,
  p_terms_version text
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
  if btrim(coalesce(p_terms_version, '')) = '' then
    raise exception 'CONSENT_REQUIRED' using errcode = '23514';
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
  if coalesce(v_ticket.admissions_used, 0) > 0 then
    raise exception 'TICKET_ALREADY_ADMITTED' using errcode = '23514';
  end if;
  if v_ticket.transfer_count >= v_ticket.max_transfers_allowed then
    raise exception 'TRANSFER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if public.ticket_has_active_resale_listing(v_ticket.id) then
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
    open_claim,
    expires_at
  )
  values (
    v_sender,
    'share@tokepass.invalid',
    v_ticket.id,
    null,
    'pending'::public.ticket_transfer_status,
    v_token_hash,
    null,
    true,
    now() + interval '24 hours'
  )
  returning id into v_transfer_id;

  perform public.record_ticket_action_consent(
    v_sender,
    v_ticket.id,
    'transfer',
    p_terms_version,
    v_transfer_id,
    null
  );

  return query select
    v_transfer_id,
    v_raw_token,
    coalesce(v_event_title, 'Evento Tokepass');
end;
$$;

revoke all on function public.initiate_ticket_share_transfer(uuid, text) from public;
grant execute on function public.initiate_ticket_share_transfer(uuid, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Email transfer: mismo consentimiento + TTL
-- -----------------------------------------------------------------------------
drop function if exists public.initiate_ticket_transfer(uuid, text);

create or replace function public.initiate_ticket_transfer(
  p_ticket_id uuid,
  p_receiver_email text,
  p_terms_version text
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
  if btrim(coalesce(p_terms_version, '')) = '' then
    raise exception 'CONSENT_REQUIRED' using errcode = '23514';
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
  if coalesce(v_ticket.admissions_used, 0) > 0 then
    raise exception 'TICKET_ALREADY_ADMITTED' using errcode = '23514';
  end if;
  if v_ticket.transfer_count >= v_ticket.max_transfers_allowed then
    raise exception 'TRANSFER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if public.ticket_has_active_resale_listing(v_ticket.id) then
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
    receiver_id,
    expires_at
  )
  values (
    v_sender,
    v_email,
    v_ticket.id,
    null,
    'pending'::public.ticket_transfer_status,
    v_token_hash,
    v_receiver_id,
    now() + interval '24 hours'
  )
  returning id into v_transfer_id;

  perform public.record_ticket_action_consent(
    v_sender,
    v_ticket.id,
    'transfer',
    p_terms_version,
    v_transfer_id,
    null
  );

  return query select
    v_transfer_id,
    v_raw_token,
    coalesce(v_event_title, 'Evento Tokepass'),
    v_email;
end;
$$;

revoke all on function public.initiate_ticket_transfer(uuid, text, text) from public;
grant execute on function public.initiate_ticket_transfer(uuid, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Reventa: consentimiento en la misma transaccion
-- -----------------------------------------------------------------------------
drop function if exists public.create_resale_listing(uuid);

create or replace function public.create_resale_listing(
  p_ticket_id uuid,
  p_terms_version text
)
returns table (
  listing_id uuid,
  ticket_id uuid,
  event_id uuid,
  price numeric,
  status public.ticket_resale_listing_status,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_seller uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_tier_price numeric;
  v_price numeric;
  v_fee numeric;
  v_net numeric;
  v_secret text;
  v_listing public.ticket_resale_listings%rowtype;
begin
  if v_seller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if btrim(coalesce(p_terms_version, '')) = '' then
    raise exception 'CONSENT_REQUIRED' using errcode = '23514';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ticket.owner_id is distinct from v_seller then
    raise exception 'NOT_TICKET_OWNER' using errcode = '42501';
  end if;
  if v_ticket.status::text <> 'valid' then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;
  if coalesce(v_ticket.is_test, false) then
    raise exception 'TICKET_IS_TEST' using errcode = '23514';
  end if;
  if coalesce(v_ticket.admissions_used, 0) > 0 then
    raise exception 'TICKET_ALREADY_ADMITTED' using errcode = '23514';
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

  if public.ticket_has_active_resale_listing(v_ticket.id) then
    raise exception 'TICKET_ALREADY_LISTED' using errcode = 'P0001';
  end if;

  select tt.price
    into v_tier_price
  from public.ticket_tiers as tt
  where tt.id = v_ticket.tier_id;

  v_price := round(coalesce(v_tier_price, 0)::numeric, 2);
  if v_price <= 0 then
    raise exception 'TICKET_NOT_RESALABLE' using errcode = '23514';
  end if;

  v_fee := round(v_price * 0.10, 2);
  v_net := round(v_price - v_fee, 2);
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  update public.tickets
  set
    totp_secret = v_secret,
    updated_at = now()
  where id = v_ticket.id;

  begin
    insert into public.ticket_resale_listings (
      ticket_id,
      seller_id,
      event_id,
      price,
      platform_fee_amount,
      seller_net_amount,
      status
    )
    values (
      v_ticket.id,
      v_seller,
      v_ticket.event_id,
      v_price,
      v_fee,
      v_net,
      'active'::public.ticket_resale_listing_status
    )
    returning * into v_listing;
  exception
    when unique_violation then
      raise exception 'TICKET_ALREADY_LISTED' using errcode = 'P0001';
  end;

  perform public.record_ticket_action_consent(
    v_seller,
    v_ticket.id,
    'resale',
    p_terms_version,
    null,
    v_listing.id
  );

  return query select
    v_listing.id,
    v_listing.ticket_id,
    v_listing.event_id,
    v_listing.price,
    v_listing.status,
    v_listing.created_at;
end;
$$;

revoke all on function public.create_resale_listing(uuid, text) from public;
grant execute on function public.create_resale_listing(uuid, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Peek / claim: token vencido no se puede usar
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
    case
      when tr.status = 'pending'::public.ticket_transfer_status
        and tr.expires_at is not null
        and tr.expires_at <= now()
        then 'cancelled'::public.ticket_transfer_status
      else tr.status
    end,
    coalesce(e.title, 'Evento Tokepass'),
    e.date,
    coalesce(e.flyer_url, e.image_url),
    tr.receiver_email,
    case
      when tr.status = 'pending'::public.ticket_transfer_status
        and tr.expires_at is not null
        and tr.expires_at <= now()
        then false
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
