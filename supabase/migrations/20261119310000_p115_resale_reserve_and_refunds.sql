-- P115b · Reserva de reventa (TTL) + complete acepta reserved
-- Requiere P115a commiteado (20261119300000_p115_resale_reserve_enum.sql).
-- El refund automatico vive en el webhook (TS). Aqui: reserved_until
-- y gates que tratan reserved como listing abierto.

alter table public.ticket_resale_listings
  add column if not exists reserved_until timestamptz;

comment on column public.ticket_resale_listings.reserved_until is
  'Fin del hold de checkout (15 min). Null si el listing esta active/sold/cancelled.';

drop index if exists public.ticket_resale_listings_ticket_active_uidx;
create unique index if not exists ticket_resale_listings_ticket_open_uidx
  on public.ticket_resale_listings (ticket_id)
  where status in (
    'active'::public.ticket_resale_listing_status,
    'reserved'::public.ticket_resale_listing_status
  );

drop policy if exists ticket_resale_listings_update_own
  on public.ticket_resale_listings;
create policy ticket_resale_listings_update_own
on public.ticket_resale_listings
for update
to authenticated
using (
  seller_id = (select auth.uid())
  and (
    status = 'active'::public.ticket_resale_listing_status
    or (
      status = 'reserved'::public.ticket_resale_listing_status
      and reserved_until is not null
      and reserved_until <= now()
    )
  )
)
with check (
  seller_id = (select auth.uid())
  and status = 'cancelled'::public.ticket_resale_listing_status
);

-- -----------------------------------------------------------------------------
-- Listing abierto = active o reserved (puerta, cesion, publicar)
-- -----------------------------------------------------------------------------
create or replace function public.ticket_has_active_resale_listing(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.ticket_resale_listings as l
    where l.ticket_id = p_ticket_id
      and l.status in (
        'active'::public.ticket_resale_listing_status,
        'reserved'::public.ticket_resale_listing_status
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- Liberar reservas vencidas
-- -----------------------------------------------------------------------------
create or replace function public.expire_resale_listing_reservations()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
begin
  update public.ticket_resale_listings
  set
    status = 'active'::public.ticket_resale_listing_status,
    buyer_id = null,
    reserved_until = null,
    mp_preference_id = null,
    updated_at = now()
  where status = 'reserved'::public.ticket_resale_listing_status
    and reserved_until is not null
    and reserved_until <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_resale_listing_reservations() from public;
grant execute on function public.expire_resale_listing_reservations()
  to service_role;

-- -----------------------------------------------------------------------------
-- Reservar listing para un comprador (TTL)
-- -----------------------------------------------------------------------------
create or replace function public.reserve_resale_listing(
  p_listing_id uuid,
  p_ttl_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_buyer uuid := auth.uid();
  v_listing public.ticket_resale_listings%rowtype;
  v_until timestamptz;
  v_ttl integer;
begin
  if v_buyer is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_ttl := greatest(1, least(coalesce(p_ttl_minutes, 15), 60));
  v_until := now() + make_interval(mins => v_ttl);

  select *
    into v_listing
  from public.ticket_resale_listings as l
  where l.id = p_listing_id
  for update of l;

  if not found then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_listing.status = 'reserved'::public.ticket_resale_listing_status
     and v_listing.reserved_until is not null
     and v_listing.reserved_until <= now() then
    update public.ticket_resale_listings
    set
      status = 'active'::public.ticket_resale_listing_status,
      buyer_id = null,
      reserved_until = null,
      mp_preference_id = null,
      updated_at = now()
    where id = v_listing.id;
    v_listing.status := 'active'::public.ticket_resale_listing_status;
    v_listing.buyer_id := null;
    v_listing.reserved_until := null;
  end if;

  if v_listing.status in (
    'sold'::public.ticket_resale_listing_status,
    'cancelled'::public.ticket_resale_listing_status
  ) then
    raise exception 'LISTING_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if v_listing.seller_id = v_buyer then
    raise exception 'CANNOT_BUY_OWN' using errcode = '23514';
  end if;

  if v_listing.status = 'reserved'::public.ticket_resale_listing_status
     and v_listing.buyer_id is distinct from v_buyer then
    raise exception 'LISTING_RESERVED' using errcode = 'P0001';
  end if;

  if v_listing.status not in (
    'active'::public.ticket_resale_listing_status,
    'reserved'::public.ticket_resale_listing_status
  ) then
    raise exception 'LISTING_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  update public.ticket_resale_listings
  set
    status = 'reserved'::public.ticket_resale_listing_status,
    buyer_id = v_buyer,
    reserved_until = v_until,
    updated_at = now()
  where id = v_listing.id
  returning * into v_listing;

  return jsonb_build_object(
    'ok', true,
    'listing_id', v_listing.id,
    'ticket_id', v_listing.ticket_id,
    'event_id', v_listing.event_id,
    'seller_id', v_listing.seller_id,
    'price', v_listing.price,
    'reserved_until', v_listing.reserved_until
  );
end;
$$;

revoke all on function public.reserve_resale_listing(uuid, integer) from public;
grant execute on function public.reserve_resale_listing(uuid, integer)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Soltar reserva (comprador autenticado o service_role)
-- -----------------------------------------------------------------------------
create or replace function public.release_resale_listing_reservation(
  p_listing_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_updated integer := 0;
begin
  if not v_is_service and v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.ticket_resale_listings
  set
    status = 'active'::public.ticket_resale_listing_status,
    buyer_id = null,
    reserved_until = null,
    mp_preference_id = null,
    updated_at = now()
  where id = p_listing_id
    and status = 'reserved'::public.ticket_resale_listing_status
    and (
      v_is_service
      or buyer_id = v_actor
    );

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.release_resale_listing_reservation(uuid) from public;
grant execute on function public.release_resale_listing_reservation(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Complete: acepta reserved del mismo buyer (aunque el TTL ya venció)
-- -----------------------------------------------------------------------------
create or replace function public.complete_ticket_resale_purchase(
  p_listing_id uuid,
  p_buyer_user_id uuid,
  p_mp_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_listing public.ticket_resale_listings%rowtype;
  v_buyer_email text;
  v_transfer record;
  v_payout_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_listing_id is null
    or p_buyer_user_id is null
    or nullif(btrim(p_mp_payment_id), '') is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  select *
    into v_listing
  from public.ticket_resale_listings as l
  where l.id = p_listing_id
  for update of l;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'listing_not_found');
  end if;

  if v_listing.status = 'sold'::public.ticket_resale_listing_status
    and v_listing.mp_payment_id is not distinct from btrim(p_mp_payment_id) then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'listing_id', v_listing.id
    );
  end if;

  if v_listing.status not in (
    'active'::public.ticket_resale_listing_status,
    'reserved'::public.ticket_resale_listing_status
  ) then
    return jsonb_build_object('ok', false, 'code', 'listing_not_active');
  end if;

  if v_listing.buyer_id is not null
     and v_listing.buyer_id is distinct from p_buyer_user_id then
    return jsonb_build_object('ok', false, 'code', 'listing_reserved_other');
  end if;

  if v_listing.seller_id = p_buyer_user_id then
    return jsonb_build_object('ok', false, 'code', 'cannot_buy_own');
  end if;

  select lower(btrim(p.email))
    into v_buyer_email
  from public.profiles as p
  where p.id = p_buyer_user_id;

  if v_buyer_email is null or v_buyer_email = '' then
    return jsonb_build_object('ok', false, 'code', 'buyer_email_missing');
  end if;

  select *
    into v_transfer
  from public.execute_safe_transfer(
    v_listing.ticket_id,
    v_buyer_email,
    v_listing.seller_id
  );

  update public.tickets as t
  set
    holder_email = v_buyer_email,
    holder_name = coalesce(
      (
        select nullif(btrim(p.full_name), '')
        from public.profiles as p
        where p.id = p_buyer_user_id
      ),
      t.holder_name
    ),
    holder_dni = coalesce(
      (
        select nullif(btrim(p.dni), '')
        from public.profiles as p
        where p.id = p_buyer_user_id
      ),
      t.holder_dni
    ),
    updated_at = now()
  where t.id = v_transfer.new_ticket_id;

  update public.ticket_resale_listings
  set
    status = 'sold'::public.ticket_resale_listing_status,
    buyer_id = p_buyer_user_id,
    mp_payment_id = btrim(p_mp_payment_id),
    reserved_until = null,
    updated_at = now()
  where id = v_listing.id;

  insert into public.payouts_pending (
    seller_id,
    listing_id,
    event_id,
    gross_amount,
    platform_fee,
    net_amount,
    mp_payment_id,
    status
  )
  values (
    v_listing.seller_id,
    v_listing.id,
    v_listing.event_id,
    v_listing.price,
    v_listing.platform_fee_amount,
    v_listing.seller_net_amount,
    btrim(p_mp_payment_id),
    'pending'::public.payout_pending_status
  )
  on conflict (listing_id) do nothing
  returning id into v_payout_id;

  return jsonb_build_object(
    'ok', true,
    'listing_id', v_listing.id,
    'transfer_id', v_transfer.transfer_id,
    'new_ticket_id', v_transfer.new_ticket_id,
    'payout_id', v_payout_id
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', 'transfer_failed',
      'message', SQLERRM
    );
end;
$$;

revoke all on function public.complete_ticket_resale_purchase(uuid, uuid, text)
  from public;
grant execute on function public.complete_ticket_resale_purchase(uuid, uuid, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- Puerta: reserved tambien bloquea
-- -----------------------------------------------------------------------------
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

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;

-- Cesion: reserved cuenta como listado
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
