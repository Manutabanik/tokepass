-- P122 · Cola de webhooks (pending) + expire en lotes de 500 SKIP LOCKED

-- -----------------------------------------------------------------------------
-- 1) Ledger de webhooks: ingest async
-- -----------------------------------------------------------------------------
alter table public.payment_webhook_events
  add column if not exists status text;

update public.payment_webhook_events
set status = 'processed'
where status is null;

alter table public.payment_webhook_events
  alter column status set default 'pending';

alter table public.payment_webhook_events
  alter column status set not null;

alter table public.payment_webhook_events
  drop constraint if exists payment_webhook_events_status_check;

alter table public.payment_webhook_events
  add constraint payment_webhook_events_status_check
  check (status in ('pending', 'processing', 'processed', 'failed'));

alter table public.payment_webhook_events
  add column if not exists attempts integer not null default 0;

alter table public.payment_webhook_events
  add column if not exists last_error text;

alter table public.payment_webhook_events
  add column if not exists available_at timestamptz not null default now();

alter table public.payment_webhook_events
  add column if not exists received_at timestamptz not null default now();

alter table public.payment_webhook_events
  alter column processed_at drop not null;

alter table public.payment_webhook_events
  alter column processed_at drop default;

create index if not exists payment_webhook_events_queue_idx
  on public.payment_webhook_events (status, available_at, received_at)
  where status in ('pending', 'failed');

comment on column public.payment_webhook_events.status is
  'pending=ACK al PSP; processing=worker; processed=finalize ok; failed=reintento.';

create or replace function public.claim_payment_webhook_events(
  p_limit integer default 10
)
returns setof public.payment_webhook_events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  with picked as (
    select e.id
    from public.payment_webhook_events as e
    where e.status in ('pending', 'failed')
      and e.available_at <= now()
      and e.attempts < 12
    order by e.received_at asc
    limit v_limit
    for update skip locked
  )
  update public.payment_webhook_events as e
  set
    status = 'processing',
    attempts = e.attempts + 1
  from picked
  where e.id = picked.id
  returning e.*;
end;
$$;

revoke all on function public.claim_payment_webhook_events(integer) from public;
grant execute on function public.claim_payment_webhook_events(integer)
  to service_role;

create or replace function public.enqueue_payment_webhook_event(
  p_provider text,
  p_external_event_id text,
  p_event_type text,
  p_payload jsonb
)
returns table (
  id uuid,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider public.payment_provider_type;
  v_tx text := nullif(btrim(coalesce(p_external_event_id, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_tx is null then
    return;
  end if;

  begin
    v_provider := btrim(coalesce(p_provider, ''))::public.payment_provider_type;
  exception
    when invalid_text_representation then
      return;
  end;

  return query
  insert into public.payment_webhook_events (
    provider,
    external_event_id,
    event_type,
    payload,
    status,
    processed_at,
    available_at,
    last_error
  )
  values (
    v_provider,
    v_tx,
    coalesce(nullif(btrim(coalesce(p_event_type, '')), ''), 'payment'),
    coalesce(p_payload, '{}'::jsonb),
    'pending',
    null,
    now(),
    null
  )
  on conflict (provider, external_event_id) do update
  set
    payload = excluded.payload,
    event_type = excluded.event_type,
    available_at = now(),
    last_error = null
  where public.payment_webhook_events.status in ('pending', 'failed')
  returning
    public.payment_webhook_events.id,
    public.payment_webhook_events.status::text;

  if not found then
    return query
    select e.id, e.status
    from public.payment_webhook_events as e
    where e.provider = v_provider
      and e.external_event_id = v_tx;
  end if;
end;
$$;

revoke all on function public.enqueue_payment_webhook_event(text, text, text, jsonb)
  from public;
grant execute on function public.enqueue_payment_webhook_event(text, text, text, jsonb)
  to service_role;

create or replace function public.claim_and_finalize_paid_order(
  p_order_id uuid,
  p_provider text,
  p_transaction_id text,
  p_event_type text default 'payment.approved',
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result jsonb;
  v_provider public.payment_provider_type;
  v_tx text;
  v_ok boolean := false;
  v_code text;
  v_needs_refund boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_tx := nullif(btrim(coalesce(p_transaction_id, '')), '');
  if p_order_id is null or v_tx is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  begin
    v_provider := btrim(coalesce(p_provider, ''))::public.payment_provider_type;
  exception
    when invalid_text_representation then
      return jsonb_build_object('ok', false, 'code', 'invalid_provider');
  end;

  v_result := public.finalize_paid_order(
    p_order_id,
    p_provider,
    v_tx,
    coalesce(p_payload, '{}'::jsonb)
  );

  if v_result is null then
    raise exception 'claim_finalize_rejected:finalize_failed'
      using errcode = 'P0001';
  end if;

  v_ok := coalesce((v_result ->> 'ok')::boolean, false);
  v_code := nullif(btrim(coalesce(v_result ->> 'code', '')), '');
  v_needs_refund := coalesce((v_result ->> 'needs_refund')::boolean, false);

  if v_ok then
    insert into public.payment_webhook_events (
      provider,
      external_event_id,
      event_type,
      payload,
      status,
      processed_at,
      last_error
    )
    values (
      v_provider,
      v_tx,
      coalesce(nullif(btrim(coalesce(p_event_type, '')), ''), 'payment.approved'),
      coalesce(p_payload, '{}'::jsonb),
      'processed',
      now(),
      null
    )
    on conflict (provider, external_event_id) do update
    set
      status = 'processed',
      processed_at = now(),
      last_error = null,
      event_type = excluded.event_type;

    return v_result;
  end if;

  if v_code = 'already_paid_other_payment' then
    return v_result || jsonb_build_object('needs_refund', true);
  end if;

  if v_needs_refund then
    return v_result;
  end if;

  raise exception 'claim_finalize_rejected:%', coalesce(v_code, 'finalize_failed')
    using errcode = 'P0001';
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) Expire: batch 500 + SKIP LOCKED
-- -----------------------------------------------------------------------------
drop function if exists public.expire_abandoned_orders(interval);
drop function if exists public.expire_seating_orders();
drop function if exists public.expire_seating_cart_holds();
drop function if exists public.expire_ga_cart_holds();
drop function if exists public.expire_resale_listing_reservations();
drop function if exists public.expire_pending_ticket_transfers();

create or replace function public.expire_abandoned_orders(
  p_older_than interval default interval '8 minutes',
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_order_id in
    select o.id
    from public.orders as o
    where o.status = 'pending'
      and o.created_at < (now() - p_older_than)
    order by o.created_at asc
    limit v_batch
    for update skip locked
  loop
    if public.expire_abandoned_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_abandoned_orders(interval, integer) from public;
grant execute on function public.expire_abandoned_orders(interval, integer)
  to service_role;

comment on function public.expire_abandoned_orders(interval, integer) is
  'Libera holds GA/pending. Batch default 500. FOR UPDATE SKIP LOCKED.';

create or replace function public.expire_seating_orders(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_order_id in
    select o.id
    from public.orders as o
    where o.status = 'pending'
      and exists (
        select 1
        from public.event_seating_units as u
        where u.reserved_order_id = o.id
          and u.status = 'reserved'
          and u.reserved_until <= now()
      )
    order by o.created_at asc
    limit v_batch
    for update of o skip locked
  loop
    if public.expire_seating_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_seating_orders(integer) from public;
grant execute on function public.expire_seating_orders(integer)
  to service_role;

create or replace function public.expire_seating_cart_holds(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with expired as (
    select u.id
    from public.event_seating_units as u
    where u.status = 'reserved'
      and u.reserved_order_id is null
      and u.reserved_until <= now()
    order by u.reserved_until asc
    limit v_batch
    for update skip locked
  )
  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  from expired
  where u.id = expired.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_seating_cart_holds(integer) from public;
grant execute on function public.expire_seating_cart_holds(integer)
  to service_role;

create or replace function public.expire_ga_cart_holds(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.event_ga_cart_holds%rowtype;
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_row in
    select *
    from public.event_ga_cart_holds
    where reserved_until <= clock_timestamp()
    order by reserved_until asc
    limit v_batch
    for update skip locked
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_row.quantity)
    where id = v_row.tier_id;

    delete from public.event_ga_cart_holds where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_ga_cart_holds(integer) from public;
grant execute on function public.expire_ga_cart_holds(integer)
  to service_role;

create or replace function public.expire_resale_listing_reservations(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with expired as (
    select l.id
    from public.ticket_resale_listings as l
    where l.status = 'reserved'::public.ticket_resale_listing_status
      and l.reserved_until is not null
      and l.reserved_until <= now()
    order by l.reserved_until asc
    limit v_batch
    for update skip locked
  )
  update public.ticket_resale_listings as l
  set
    status = 'active'::public.ticket_resale_listing_status,
    buyer_id = null,
    reserved_until = null,
    mp_preference_id = null,
    updated_at = now()
  from expired
  where l.id = expired.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_resale_listing_reservations(integer) from public;
grant execute on function public.expire_resale_listing_reservations(integer)
  to service_role;

create or replace function public.expire_pending_ticket_transfers(
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 500), 2000));
begin
  for v_row in
    select tr.id
    from public.ticket_transfers as tr
    where tr.status = 'pending'::public.ticket_transfer_status
      and tr.expires_at is not null
      and tr.expires_at <= now()
    order by tr.expires_at
    limit v_batch
    for update skip locked
  loop
    if public.expire_one_pending_ticket_transfer(v_row.id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_pending_ticket_transfers(integer) from public;
grant execute on function public.expire_pending_ticket_transfers(integer)
  to service_role;
