-- P150: short-window checkout idempotency for double-clicks / retries.
-- The reserve RPCs stay the source of stock truth; this only blocks a second
-- order for the same buyer + attempt key (or lets the second request reuse it).

create table if not exists public.checkout_idempotency_keys (
  buyer_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  event_id uuid not null references public.events (id) on delete cascade,
  cart_fingerprint text not null,
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (buyer_id, idempotency_key)
);

create index if not exists checkout_idempotency_keys_order_idx
  on public.checkout_idempotency_keys (order_id)
  where order_id is not null;

create index if not exists checkout_idempotency_keys_event_created_idx
  on public.checkout_idempotency_keys (buyer_id, event_id, created_at desc);

comment on table public.checkout_idempotency_keys is
  'One checkout attempt key per buyer. Reuses the pending/paid order on retries.';

alter table public.checkout_idempotency_keys enable row level security;
revoke all on table public.checkout_idempotency_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.checkout_idempotency_keys to service_role;

create or replace function public.claim_checkout_idempotency_key(
  p_buyer_id uuid,
  p_event_id uuid,
  p_idempotency_key uuid,
  p_cart_fingerprint text
)
returns table (
  reused boolean,
  in_progress boolean,
  fingerprint_mismatch boolean,
  order_id uuid,
  order_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_fingerprint text;
  v_order uuid;
  v_created timestamptz;
  v_status text;
begin
  if p_buyer_id is null
     or p_event_id is null
     or p_idempotency_key is null
     or nullif(btrim(coalesce(p_cart_fingerprint, '')), '') is null then
    raise exception 'invalid_idempotency_args' using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_buyer_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('tp-checkout:' || p_buyer_id::text),
    hashtext(p_idempotency_key::text)
  );

  select
    k.cart_fingerprint,
    k.order_id,
    k.created_at,
    o.status::text
    into v_fingerprint, v_order, v_created, v_status
  from public.checkout_idempotency_keys as k
  left join public.orders as o on o.id = k.order_id
  where k.buyer_id = p_buyer_id
    and k.idempotency_key = p_idempotency_key;

  if found then
    if v_fingerprint is distinct from p_cart_fingerprint then
      reused := false;
      in_progress := false;
      fingerprint_mismatch := true;
      order_id := v_order;
      order_status := v_status;
      return next;
      return;
    end if;

    if v_status = 'paid' or v_status = 'pending' then
      reused := true;
      in_progress := false;
      fingerprint_mismatch := false;
      order_id := v_order;
      order_status := v_status;
      return next;
      return;
    end if;

    if v_order is null and v_created > now() - interval '60 seconds' then
      reused := false;
      in_progress := true;
      fingerprint_mismatch := false;
      order_id := null;
      order_status := null;
      return next;
      return;
    end if;

    update public.checkout_idempotency_keys
    set
      event_id = p_event_id,
      cart_fingerprint = p_cart_fingerprint,
      order_id = null,
      created_at = now()
    where buyer_id = p_buyer_id
      and idempotency_key = p_idempotency_key;

    reused := false;
    in_progress := false;
    fingerprint_mismatch := false;
    order_id := null;
    order_status := null;
    return next;
    return;
  end if;

  insert into public.checkout_idempotency_keys (
    buyer_id,
    idempotency_key,
    event_id,
    cart_fingerprint,
    order_id
  ) values (
    p_buyer_id,
    p_idempotency_key,
    p_event_id,
    p_cart_fingerprint,
    null
  );

  reused := false;
  in_progress := false;
  fingerprint_mismatch := false;
  order_id := null;
  order_status := null;
  return next;
end;
$$;

revoke all on function public.claim_checkout_idempotency_key(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.claim_checkout_idempotency_key(uuid, uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.attach_checkout_idempotency_order(
  p_buyer_id uuid,
  p_idempotency_key uuid,
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_buyer_id is null or p_idempotency_key is null or p_order_id is null then
    return;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_buyer_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.checkout_idempotency_keys
  set order_id = p_order_id
  where buyer_id = p_buyer_id
    and idempotency_key = p_idempotency_key;
end;
$$;

revoke all on function public.attach_checkout_idempotency_order(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.attach_checkout_idempotency_order(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function public.release_checkout_idempotency_order(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_order_id is null then
    return;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  delete from public.checkout_idempotency_keys
  where order_id = p_order_id;
end;
$$;

revoke all on function public.release_checkout_idempotency_order(uuid)
  from public, anon;
grant execute on function public.release_checkout_idempotency_order(uuid)
  to authenticated, service_role;
