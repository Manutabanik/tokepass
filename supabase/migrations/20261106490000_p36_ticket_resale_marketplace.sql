-- P36: Fan-to-Fan official resale marketplace
-- Listings + seller payouts + service-role completion that reuses execute_safe_transfer.

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'ticket_resale_listing_status'
  ) then
    create type public.ticket_resale_listing_status as enum (
      'active',
      'sold',
      'cancelled'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'payout_pending_status'
  ) then
    create type public.payout_pending_status as enum (
      'pending',
      'paid',
      'cancelled'
    );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- ticket_resale_listings
-- -----------------------------------------------------------------------------
create table if not exists public.ticket_resale_listings (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  price numeric(12, 2) not null check (price > 0),
  platform_fee_amount numeric(12, 2) not null default 0
    check (platform_fee_amount >= 0),
  seller_net_amount numeric(12, 2) not null default 0
    check (seller_net_amount >= 0),
  status public.ticket_resale_listing_status not null default 'active',
  buyer_id uuid references public.profiles (id) on delete set null,
  mp_preference_id text,
  mp_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_resale_listings_price_fee_check
    check (platform_fee_amount <= price),
  constraint ticket_resale_listings_net_check
    check (abs((price - platform_fee_amount) - seller_net_amount) < 0.02)
);

create unique index if not exists ticket_resale_listings_ticket_active_uidx
  on public.ticket_resale_listings (ticket_id)
  where status = 'active';

create index if not exists ticket_resale_listings_event_active_idx
  on public.ticket_resale_listings (event_id)
  where status = 'active';

create index if not exists ticket_resale_listings_seller_id_idx
  on public.ticket_resale_listings (seller_id);

comment on table public.ticket_resale_listings is
  'Listados de reventa oficial fan-to-fan al precio All-In del tier.';

-- -----------------------------------------------------------------------------
-- payouts_pending
-- -----------------------------------------------------------------------------
create table if not exists public.payouts_pending (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete restrict,
  listing_id uuid not null references public.ticket_resale_listings (id)
    on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  gross_amount numeric(12, 2) not null check (gross_amount > 0),
  platform_fee numeric(12, 2) not null default 0 check (platform_fee >= 0),
  net_amount numeric(12, 2) not null check (net_amount >= 0),
  mp_payment_id text,
  status public.payout_pending_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_pending_listing_uidx unique (listing_id)
);

create index if not exists payouts_pending_seller_status_idx
  on public.payouts_pending (seller_id, status);

comment on table public.payouts_pending is
  'Liquidaciones pendientes a vendedores fan tras reventa oficial.';

-- updated_at helpers
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ticket_resale_listings_set_updated_at
  on public.ticket_resale_listings;
create trigger ticket_resale_listings_set_updated_at
before update on public.ticket_resale_listings
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists payouts_pending_set_updated_at on public.payouts_pending;
create trigger payouts_pending_set_updated_at
before update on public.payouts_pending
for each row execute function public.set_updated_at_timestamp();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.ticket_resale_listings enable row level security;
alter table public.payouts_pending enable row level security;

drop policy if exists ticket_resale_listings_select on public.ticket_resale_listings;
create policy ticket_resale_listings_select
on public.ticket_resale_listings
for select
to anon, authenticated
using (
  status = 'active'::public.ticket_resale_listing_status
  or seller_id = (select auth.uid())
  or buyer_id = (select auth.uid())
  or (select public.is_super_admin())
);

drop policy if exists ticket_resale_listings_insert_own
  on public.ticket_resale_listings;
create policy ticket_resale_listings_insert_own
on public.ticket_resale_listings
for insert
to authenticated
with check (
  seller_id = (select auth.uid())
  and exists (
    select 1
    from public.tickets as t
    where t.id = ticket_id
      and t.owner_id = (select auth.uid())
      and t.status = 'valid'::public.ticket_status
      and t.event_id = event_id
  )
);

drop policy if exists ticket_resale_listings_update_own
  on public.ticket_resale_listings;
create policy ticket_resale_listings_update_own
on public.ticket_resale_listings
for update
to authenticated
using (
  seller_id = (select auth.uid())
  and status = 'active'::public.ticket_resale_listing_status
)
with check (
  seller_id = (select auth.uid())
  and status = 'cancelled'::public.ticket_resale_listing_status
);

drop policy if exists payouts_pending_select_own on public.payouts_pending;
create policy payouts_pending_select_own
on public.payouts_pending
for select
to authenticated
using (
  seller_id = (select auth.uid())
  or (select public.is_super_admin())
);

-- No direct insert/update for users; service_role / SECURITY DEFINER only.
revoke insert, update, delete on public.payouts_pending from authenticated, anon;
revoke insert, update, delete on public.ticket_resale_listings from anon;
grant select on public.ticket_resale_listings to anon, authenticated;
grant insert, update on public.ticket_resale_listings to authenticated;
grant select on public.payouts_pending to authenticated;

-- -----------------------------------------------------------------------------
-- Extend execute_safe_transfer for service_role (resale webhook)
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
set search_path = pg_catalog, extensions
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

  -- Cancel any active resale listing for this ticket (gift transfer or resale).
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

-- Keep 2-arg overload for existing clients (maps to 3-arg default).
create or replace function public.execute_safe_transfer(
  p_ticket_id uuid,
  p_receiver_email text
)
returns table (
  transfer_id uuid,
  new_ticket_id uuid,
  event_title text,
  receiver_email text,
  receiver_user_id uuid
)
language sql
security definer
set search_path = pg_catalog, extensions
as $$
  select * from public.execute_safe_transfer(p_ticket_id, p_receiver_email, null::uuid);
$$;

revoke all on function public.execute_safe_transfer(uuid, text) from public;
grant execute on function public.execute_safe_transfer(uuid, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Atomic resale completion (webhook / service_role)
-- -----------------------------------------------------------------------------
create or replace function public.complete_ticket_resale_purchase(
  p_listing_id uuid,
  p_buyer_user_id uuid,
  p_mp_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions
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

  if v_listing.status <> 'active'::public.ticket_resale_listing_status then
    return jsonb_build_object('ok', false, 'code', 'listing_not_active');
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
