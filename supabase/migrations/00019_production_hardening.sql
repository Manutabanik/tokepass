-- =============================================================================
-- Tokepass · Production Hardening (00019)
-- - Revoca RPC legacy de minting gratis
-- - GRANT scanned_at (scanner online/offline)
-- - Cierra UPDATE financiero de orders al cliente
-- - Transfer: anti-scalp receptor + rotación totp_secret emisor
-- - RLS profiles: organizador lee titulares de sus eventos
-- - Idempotencia webhooks MP
-- =============================================================================

-- 1) Bypass crítico: reserve_tickets mintaba tickets free sin pago ni anti-scalp
drop function if exists public.reserve_tickets(uuid, uuid, integer);

-- 2) Scanner escribe scanned_at con sesión authenticated
grant update (scanned_at) on public.tickets to authenticated;

-- 3) Cliente no debe reescribir montos / promoter de órdenes pending
revoke update (subtotal, service_charge, total_amount, promoter_id)
  on public.orders from authenticated;

-- Mantener solo campos operativos del checkout MP
grant update (status, mp_preference_id, mp_payment_id, customer_phone)
  on public.orders to authenticated;

-- 4) Organizador puede leer perfiles de titulares de tickets de SUS eventos
drop policy if exists "profiles_select_event_ticket_holders" on public.profiles;
create policy "profiles_select_event_ticket_holders"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.owner_id = profiles.id
      and e.organizer_id = (select auth.uid())
  )
  or (select public.is_super_admin())
);

-- 5) Ledger de webhooks MP (idempotencia estricta)
create table if not exists public.mp_webhook_events (
  payment_id text primary key,
  order_id uuid references public.orders (id) on delete set null,
  status text not null,
  processed_at timestamptz not null default now(),
  raw_summary jsonb
);

alter table public.mp_webhook_events enable row level security;

revoke all on public.mp_webhook_events from public, anon, authenticated;
grant all on public.mp_webhook_events to service_role;

-- 6) Transfer atómico hardened
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid := auth.uid();
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
    from public.profiles as p
    where p.id = v_sender
      and lower(p.email) = v_email
  ) then
    raise exception 'CANNOT_TRANSFER_TO_SELF' using errcode = '23514';
  end if;

  select p.id
    into v_receiver_id
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
      and t.status = 'valid'::public.ticket_status;

    if v_receiver_count >= v_max_per_user then
      raise exception 'MAX_TICKETS_PER_USER_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;

  -- Invalidar QR del emisor (status + nueva semilla inútil)
  update public.tickets
  set
    status = 'transferred'::public.ticket_status,
    seat_id = null,
    totp_secret = 'xfer_dead_' || replace(gen_random_uuid()::text, '-', ''),
    updated_at = now()
  where id = v_ticket.id;

  v_secret := encode(gen_random_bytes(24), 'hex');

  insert into public.tickets (
    event_id,
    tier_id,
    owner_id,
    qr_code,
    status,
    order_id,
    seat_id,
    is_dynamic_qr,
    totp_secret,
    max_transfers_allowed,
    transfer_count
  )
  values (
    v_ticket.event_id,
    v_ticket.tier_id,
    v_receiver_id,
    'xfer_' || replace(gen_random_uuid()::text, '-', ''),
    'valid'::public.ticket_status,
    v_ticket.order_id,
    v_ticket.seat_id,
    coalesce(v_ticket.is_dynamic_qr, true),
    v_secret,
    v_ticket.max_transfers_allowed,
    v_ticket.transfer_count + 1
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

  return query
  select
    v_transfer_id,
    v_new_ticket_id,
    coalesce(v_event_title, 'Evento Tokepass'),
    v_email,
    v_receiver_id;
end;
$$;

revoke all on function public.execute_safe_transfer(uuid, text) from public;
grant execute on function public.execute_safe_transfer(uuid, text)
  to authenticated;

comment on function public.execute_safe_transfer(uuid, text) is
  'Transfer atómico: invalida totp del emisor, nuevo totp al receptor, anti-scalp max_tickets_per_user.';
