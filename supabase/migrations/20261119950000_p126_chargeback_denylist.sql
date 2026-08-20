-- P126 · Contracargos, rotacion TOTP y lista negra de compradores
-- CB-1: in_mediation / chargebacks invalidan tickets.
-- CB-2: buyer_denylist (DNI hasheado + email normalizado).
-- CB-3: cancel_paid_order_tickets rota totp_secret.

-- -----------------------------------------------------------------------------
-- CB-3: anular semilla TOTP al cancelar tickets de una orden pagada
-- Tambien cubre tickets ya cancelled (apply_order_refund_state corre antes).
-- -----------------------------------------------------------------------------
create or replace function public.cancel_paid_order_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_tier_id uuid;
  v_count integer;
  v_total integer := 0;
  r record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return 0;
  end if;

  for v_tier_id, v_count in
    select t.tier_id, count(*)::integer
    from public.tickets as t
    where t.order_id = p_order_id
      and t.status = 'valid'::public.ticket_status
    group by t.tier_id
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_count)
    where id = v_tier_id;
    v_total := v_total + v_count;
  end loop;

  update public.event_seating_units as u
  set
    status = 'available',
    sold_order_id = null,
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'valid'::public.ticket_status
    and t.seating_unit_id = u.id
    and u.status = 'sold';

  update public.tickets
  set
    status = 'cancelled'::public.ticket_status,
    totp_secret = 'dead-cb-' || encode(gen_random_bytes(12), 'hex'),
    updated_at = now()
  where order_id = p_order_id
    and status = 'valid'::public.ticket_status;

  update public.tickets
  set
    totp_secret = 'dead-cb-' || encode(gen_random_bytes(12), 'hex'),
    status = case
      when status = 'pending_payment'::public.ticket_status
        then 'cancelled'::public.ticket_status
      else status
    end,
    updated_at = now()
  where order_id = p_order_id
    and coalesce(totp_secret, '') not like 'dead-%';

  for r in
    select ir.item_id, count(*)::integer as qty
    from public.item_redemptions as ir
    where ir.order_id = p_order_id
      and ir.status in ('pending', 'valid')
    group by ir.item_id
  loop
    update public.event_items
    set stock = stock + r.qty
    where id = r.item_id;
  end loop;

  update public.item_redemptions
  set
    status = 'cancelled',
    updated_at = now()
  where order_id = p_order_id
    and status in ('pending', 'valid');

  return v_total;
end;
$$;

revoke all on function public.cancel_paid_order_tickets(uuid) from public;
revoke all on function public.cancel_paid_order_tickets(uuid)
  from anon, authenticated;
grant execute on function public.cancel_paid_order_tickets(uuid) to service_role;

create or replace function public.apply_order_refund_state(
  p_order_id uuid,
  p_order_status text default 'refunded'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_tier_id uuid;
  v_count integer;
  v_total integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return 0;
  end if;

  if p_order_status not in ('refunded', 'refund_processing') then
    raise exception 'INVALID_REFUND_STATUS' using errcode = '22023';
  end if;

  for v_tier_id, v_count in
    select t.tier_id, count(*)::integer
    from public.tickets as t
    where t.order_id = p_order_id
      and t.status = 'valid'::public.ticket_status
    group by t.tier_id
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_count)
    where id = v_tier_id;
    v_total := v_total + v_count;
  end loop;

  update public.event_seating_units as u
  set
    status = 'available',
    sold_order_id = null,
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'valid'::public.ticket_status
    and t.seating_unit_id = u.id
    and u.status = 'sold';

  update public.tickets
  set
    status = 'cancelled'::public.ticket_status,
    totp_secret = 'dead-cb-' || encode(gen_random_bytes(12), 'hex'),
    updated_at = now()
  where order_id = p_order_id
    and status in (
      'valid'::public.ticket_status,
      'pending_payment'::public.ticket_status
    );

  get diagnostics v_count = row_count;
  v_total := greatest(v_total, coalesce(v_count, 0));

  for v_tier_id, v_count in
    select ir.item_id, count(*)::integer
    from public.item_redemptions as ir
    where ir.order_id = p_order_id
      and ir.status in ('pending', 'valid')
    group by ir.item_id
  loop
    update public.event_items
    set stock = stock + v_count
    where id = v_tier_id;
  end loop;

  update public.item_redemptions
  set
    status = 'cancelled',
    updated_at = now()
  where order_id = p_order_id
    and status in ('pending', 'valid');

  update public.orders
  set
    status = p_order_status,
    updated_at = now()
  where id = p_order_id
    and status in ('paid', 'refund_processing');

  return v_total;
end;
$$;

revoke all on function public.apply_order_refund_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_order_refund_state(uuid, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- CB-2: lista negra por fraude / contracargo
-- -----------------------------------------------------------------------------
create table if not exists public.buyer_denylist (
  id uuid primary key default gen_random_uuid(),
  dni_hash text,
  email_norm text,
  reason text not null,
  source_order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint buyer_denylist_identity_check
    check (dni_hash is not null or email_norm is not null)
);

create unique index if not exists buyer_denylist_dni_uidx
  on public.buyer_denylist (dni_hash)
  where dni_hash is not null;

create unique index if not exists buyer_denylist_email_uidx
  on public.buyer_denylist (email_norm)
  where email_norm is not null;

create index if not exists buyer_denylist_order_idx
  on public.buyer_denylist (source_order_id)
  where source_order_id is not null;

comment on table public.buyer_denylist is
  'Identidades bloqueadas tras charged_back. dni_hash = SHA-256 del DNI en digitos; email_norm = lower(trim).';

alter table public.buyer_denylist enable row level security;
revoke all on table public.buyer_denylist from public, anon, authenticated;
grant all on table public.buyer_denylist to service_role;

create or replace function public.normalize_buyer_dni(p_dni text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select nullif(regexp_replace(btrim(coalesce(p_dni, '')), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.hash_buyer_dni(p_dni text)
returns text
language sql
immutable
set search_path = pg_catalog, extensions, public
as $$
  select case
    when public.normalize_buyer_dni(p_dni) is null then null
    else encode(
      extensions.digest(
        convert_to(public.normalize_buyer_dni(p_dni), 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  end;
$$;

create or replace function public.normalize_buyer_email(p_email text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select nullif(lower(btrim(coalesce(p_email, ''))), '');
$$;

create or replace function public.assert_buyer_not_denylisted(
  p_holder_dni text,
  p_holder_email text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_dni_hash text := public.hash_buyer_dni(p_holder_dni);
  v_email text := public.normalize_buyer_email(p_holder_email);
begin
  if v_dni_hash is null and v_email is null then
    return;
  end if;

  if exists (
    select 1
    from public.buyer_denylist as d
    where (v_dni_hash is not null and d.dni_hash = v_dni_hash)
       or (v_email is not null and d.email_norm = v_email)
  ) then
    raise exception 'BUYER_DENYLISTED'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_buyer_not_denylisted(text, text) from public;
grant execute on function public.assert_buyer_not_denylisted(text, text)
  to authenticated, service_role;

create or replace function public.record_buyer_denylist_from_order(
  p_order_id uuid,
  p_reason text default 'charged_back'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_dni text;
  v_email text;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return null;
  end if;

  select
    public.normalize_buyer_dni(t.holder_dni),
    public.normalize_buyer_email(t.holder_email)
    into v_dni, v_email
  from public.tickets as t
  where t.order_id = p_order_id
  order by
    case when t.holder_dni is not null or t.holder_email is not null then 0 else 1 end,
    t.created_at asc
  limit 1;

  if v_dni is null or v_email is null then
    select
      coalesce(v_dni, public.normalize_buyer_dni(p.dni)),
      coalesce(v_email, public.normalize_buyer_email(p.email))
      into v_dni, v_email
    from public.orders as o
    join public.profiles as p on p.id = o.buyer_id
    where o.id = p_order_id;
  end if;

  if v_dni is null and v_email is null then
    return null;
  end if;

  insert into public.buyer_denylist (
    dni_hash,
    email_norm,
    reason,
    source_order_id
  )
  values (
    public.hash_buyer_dni(v_dni),
    public.normalize_buyer_email(v_email),
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'charged_back'),
    p_order_id
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select d.id
      into v_id
    from public.buyer_denylist as d
    where (public.hash_buyer_dni(v_dni) is not null and d.dni_hash = public.hash_buyer_dni(v_dni))
       or (public.normalize_buyer_email(v_email) is not null
           and d.email_norm = public.normalize_buyer_email(v_email))
    order by d.created_at desc
    limit 1;
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_buyer_denylist_from_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_buyer_denylist_from_order(uuid, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- Reserva: abortar si la identidad esta en la lista negra
-- -----------------------------------------------------------------------------
create or replace function public.reserve_unified_cart_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid,
  p_holder_dni text,
  p_holder_email text
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_requested integer := 0;
  v_order uuid;
  v_row record;
  v_dni text := nullif(btrim(coalesce(p_holder_dni, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_holder_email, ''))), '');
begin
  perform public.assert_buyer_not_denylisted(v_dni, v_email);

  select coalesce(sum(coalesce((value ->> 'quantity')::integer, 0)), 0)
    into v_requested
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));

  perform public.assert_holder_identity_ticket_cap(
    p_event_id,
    v_dni,
    v_email,
    v_requested
  );

  for v_row in
    select *
    from public.reserve_unified_cart_tx(
      p_event_id,
      p_owner_id,
      p_items,
      p_promoter_id
    )
  loop
    v_order := v_row.order_id;
    order_id := v_row.order_id;
    ticket_id := v_row.ticket_id;
    subtotal := v_row.subtotal;
    service_charge := v_row.service_charge;
    total_amount := v_row.total_amount;
    return next;
  end loop;

  if v_order is not null and (v_dni is not null or v_email is not null) then
    update public.tickets
    set
      holder_dni = coalesce(v_dni, holder_dni),
      holder_email = coalesce(v_email, holder_email),
      updated_at = now()
    where tickets.order_id = v_order
      and tickets.owner_id = p_owner_id;
  end if;
end;
$$;

revoke all on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  from public;
grant execute on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  to authenticated, service_role;

create or replace function public.claim_and_reserve_ga_cart_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid,
  p_holder_dni text,
  p_holder_email text
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_requested integer := 0;
  v_order uuid;
  v_row record;
  v_dni text := nullif(btrim(coalesce(p_holder_dni, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_holder_email, ''))), '');
begin
  perform public.assert_buyer_not_denylisted(v_dni, v_email);

  select coalesce(sum(coalesce((value ->> 'quantity')::integer, 0)), 0)
    into v_requested
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));

  perform public.assert_holder_identity_ticket_cap(
    p_event_id,
    v_dni,
    v_email,
    v_requested
  );

  for v_row in
    select *
    from public.claim_and_reserve_ga_cart_tx(
      p_event_id,
      p_owner_id,
      p_items,
      p_promoter_id
    )
  loop
    v_order := v_row.order_id;
    order_id := v_row.order_id;
    ticket_id := v_row.ticket_id;
    subtotal := v_row.subtotal;
    service_charge := v_row.service_charge;
    total_amount := v_row.total_amount;
    return next;
  end loop;

  if v_order is not null and (v_dni is not null or v_email is not null) then
    update public.tickets
    set
      holder_dni = coalesce(v_dni, holder_dni),
      holder_email = coalesce(v_email, holder_email),
      updated_at = now()
    where tickets.order_id = v_order
      and tickets.owner_id = p_owner_id;
  end if;
end;
$$;

revoke all on function public.claim_and_reserve_ga_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  from public;
grant execute on function public.claim_and_reserve_ga_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  to authenticated, service_role;

create or replace function public.reserve_unified_cart_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid,
  p_holder_dni text,
  p_holder_email text,
  p_addons jsonb
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_order uuid;
  v_row record;
begin
  perform public.assert_buyer_not_denylisted(p_holder_dni, p_holder_email);

  for v_row in
    select *
    from public.reserve_unified_cart_tx(
      p_event_id,
      p_owner_id,
      p_items,
      p_promoter_id,
      p_holder_dni,
      p_holder_email
    )
  loop
    v_order := v_row.order_id;
    order_id := v_row.order_id;
    ticket_id := v_row.ticket_id;
    subtotal := v_row.subtotal;
    service_charge := v_row.service_charge;
    total_amount := v_row.total_amount;
    return next;
  end loop;

  if v_order is not null then
    perform public.attach_event_items_to_order(
      v_order,
      p_owner_id,
      coalesce(p_addons, '[]'::jsonb)
    );
  end if;
end;
$$;

revoke all on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid, text, text, jsonb)
  from public;
grant execute on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid, text, text, jsonb)
  to authenticated, service_role;

create or replace function public.claim_and_reserve_ga_cart_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid,
  p_holder_dni text,
  p_holder_email text,
  p_addons jsonb
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_order uuid;
  v_row record;
begin
  perform public.assert_buyer_not_denylisted(p_holder_dni, p_holder_email);

  for v_row in
    select *
    from public.claim_and_reserve_ga_cart_tx(
      p_event_id,
      p_owner_id,
      p_items,
      p_promoter_id,
      p_holder_dni,
      p_holder_email
    )
  loop
    v_order := v_row.order_id;
    order_id := v_row.order_id;
    ticket_id := v_row.ticket_id;
    subtotal := v_row.subtotal;
    service_charge := v_row.service_charge;
    total_amount := v_row.total_amount;
    return next;
  end loop;

  if v_order is not null then
    perform public.attach_event_items_to_order(
      v_order,
      p_owner_id,
      coalesce(p_addons, '[]'::jsonb)
    );
  end if;
end;
$$;

revoke all on function public.claim_and_reserve_ga_cart_tx(uuid, uuid, jsonb, uuid, text, text, jsonb)
  from public;
grant execute on function public.claim_and_reserve_ga_cart_tx(uuid, uuid, jsonb, uuid, text, text, jsonb)
  to authenticated, service_role;

-- Reabrir un webhook already processed si llega chargeback / mediacion
-- (unique es provider + external_event_id; si no se reabre, el dispute se pierde).
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
  v_type text := coalesce(nullif(btrim(coalesce(p_event_type, '')), ''), 'payment');
  v_dispute boolean := v_type ~* 'chargeback|in_mediation|refund';
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
    v_type,
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
    status = case
      when public.payment_webhook_events.status = 'processing'
        then public.payment_webhook_events.status
      when v_dispute
        or public.payment_webhook_events.status in ('pending', 'failed')
        then 'pending'
      else public.payment_webhook_events.status
    end,
    processed_at = case
      when public.payment_webhook_events.status = 'processing'
        then public.payment_webhook_events.processed_at
      when v_dispute
        or public.payment_webhook_events.status in ('pending', 'failed')
        then null
      else public.payment_webhook_events.processed_at
    end,
    available_at = now(),
    last_error = null
  where public.payment_webhook_events.status in ('pending', 'failed', 'processed', 'processing')
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
