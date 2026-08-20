-- P114 · Securizacion reventa + puerta
-- 1) Publicar reventa: FOR UPDATE del ticket + rotacion de totp_secret.
-- 2) scan_ticket_admission: cesion pendiente y listing activo dentro del lock.
-- 3) Bloquear inicio de cesion / publicacion si admissions_used > 0.
-- 4) Insert de listings solo via SECURITY DEFINER (no se puede bypassear el QR).

-- -----------------------------------------------------------------------------
-- Helper: listing activo
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
      and l.status = 'active'::public.ticket_resale_listing_status
  );
$$;

revoke all on function public.ticket_has_active_resale_listing(uuid) from public;
grant execute on function public.ticket_has_active_resale_listing(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Publicar reventa (atomico)
-- Fee 10% alineado a lib/resale.ts RESALE_PLATFORM_FEE_RATE.
-- -----------------------------------------------------------------------------
create or replace function public.create_resale_listing(p_ticket_id uuid)
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

  if exists (
    select 1
    from public.ticket_resale_listings as l
    where l.ticket_id = v_ticket.id
      and l.status = 'active'::public.ticket_resale_listing_status
  ) then
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

  return query select
    v_listing.id,
    v_listing.ticket_id,
    v_listing.event_id,
    v_listing.price,
    v_listing.status,
    v_listing.created_at;
end;
$$;

revoke all on function public.create_resale_listing(uuid) from public;
grant execute on function public.create_resale_listing(uuid)
  to authenticated;

comment on function public.create_resale_listing(uuid) is
  'Publica reventa: FOR UPDATE ticket, rota totp_secret e inserta listing activo.';

drop policy if exists ticket_resale_listings_insert_own
  on public.ticket_resale_listings;
revoke insert on public.ticket_resale_listings from authenticated, anon;

-- -----------------------------------------------------------------------------
-- Puerta: gates de cesion/reventa dentro del FOR UPDATE
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

  if exists (
    select 1
    from public.ticket_resale_listings as l
    where l.ticket_id = v_ticket.id
      and l.status = 'active'::public.ticket_resale_listing_status
  ) then
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

comment on function public.scan_ticket_admission(uuid, uuid) is
  'Admision atomica. FOR UPDATE incluye cesion pendiente y listing de reventa activo.';

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Inicio de cesion por email: no si ya hubo ingreso
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
  if coalesce(v_ticket.admissions_used, 0) > 0 then
    raise exception 'TICKET_ALREADY_ADMITTED' using errcode = '23514';
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
-- Inicio de cesion por link: no si ya hubo ingreso
-- -----------------------------------------------------------------------------
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

comment on function public.initiate_ticket_share_transfer(uuid) is
  'Inicia un envio por link: exige admissions_used = 0, rota totp y devuelve token.';

-- Listings ya activos: invalidar capturas previas al aplicar P114.
update public.tickets as t
set
  totp_secret = encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at = now()
where exists (
  select 1
  from public.ticket_resale_listings as l
  where l.ticket_id = t.id
    and l.status = 'active'::public.ticket_resale_listing_status
);
