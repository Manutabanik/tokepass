-- =============================================================================
-- Tokepass · Boletería híbrida (QR dinámico / estático) + POS taquilla
-- Nota: 00016 ya existe (security transfers RPC). Este archivo es 00017.
-- =============================================================================

alter table public.events
  add column if not exists qr_type text not null default 'dynamic'
    check (qr_type in ('dynamic', 'static'));

alter table public.orders
  add column if not exists payment_method text not null default 'mercadopago'
    check (payment_method in ('mercadopago', 'cash_pos', 'transfer_pos'));

alter table public.orders
  add column if not exists customer_phone text;

alter table public.tickets
  add column if not exists scanned_at timestamptz;

comment on column public.events.qr_type is
  'dynamic = Living QR 15s; static = QR fijo imprimible / captura';

comment on column public.orders.payment_method is
  'Canal de cobro: online MP o POS físico (efectivo / transferencia)';

create index if not exists events_qr_type_idx
  on public.events (qr_type);

create index if not exists tickets_scanned_at_idx
  on public.tickets (scanned_at)
  where scanned_at is not null;

-- -----------------------------------------------------------------------------
-- Venta POS en taquilla (orden paid + tickets en una sola TX)
-- -----------------------------------------------------------------------------

create or replace function public.create_pos_sale_tx(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_staff_id uuid,
  p_customer_phone text default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  totp_secret text,
  qr_code text,
  unit_price numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_price numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event uuid;
  v_order_id uuid;
  v_subtotal numeric(12, 2);
  v_method text;
  v_phone text;
  v_i integer;
  v_ticket_id uuid;
  v_secret text;
  v_qr text;
  v_is_dynamic boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_method := lower(btrim(coalesce(p_payment_method, '')));
  if v_method not in ('cash_pos', 'transfer_pos') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_event.organizer_id is distinct from p_staff_id
     and not public.is_super_admin() then
    raise exception 'FORBIDDEN_EVENT' using errcode = '42501';
  end if;

  if v_event.status::text not in ('published', 'draft') then
    raise exception 'EVENT_NOT_SELLABLE' using errcode = '23514';
  end if;

  select tt.event_id, tt.price, tt.capacity, tt.sold
    into v_tier_event, v_price, v_capacity, v_sold
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found then
    raise exception 'TIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tier_event is distinct from p_event_id then
    raise exception 'TIER_EVENT_MISMATCH' using errcode = '23514';
  end if;

  -- No vender FreePass desde POS
  if exists (
    select 1
    from public.ticket_tiers as tt
    where tt.id = p_tier_id
      and (
        lower(tt.name) like '%freepass%'
        or lower(tt.name) like '%cortes%'
      )
  ) then
    raise exception 'TIER_NOT_ALLOWED_POS' using errcode = '23514';
  end if;

  if (v_capacity - v_sold) < p_quantity then
    raise exception 'Sold out' using errcode = 'P0001';
  end if;

  update public.ticket_tiers
  set sold = sold + p_quantity
  where id = p_tier_id;

  v_subtotal := round(v_price * p_quantity, 2);
  v_phone := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_is_dynamic := coalesce(v_event.qr_type, 'dynamic') = 'dynamic';

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    payment_method,
    customer_phone
  )
  values (
    p_staff_id,
    v_subtotal,
    0,
    v_subtotal,
    'paid',
    v_method,
    v_phone
  )
  returning id into v_order_id;

  for v_i in 1..p_quantity loop
    v_secret := encode(gen_random_bytes(24), 'hex');
    v_qr := 'pos_' || replace(gen_random_uuid()::text, '-', '');

    insert into public.tickets (
      event_id,
      tier_id,
      owner_id,
      qr_code,
      status,
      order_id,
      is_dynamic_qr,
      totp_secret
    )
    values (
      p_event_id,
      p_tier_id,
      p_staff_id,
      v_qr,
      'valid'::public.ticket_status,
      v_order_id,
      v_is_dynamic,
      v_secret
    )
    returning id into v_ticket_id;

    order_id := v_order_id;
    ticket_id := v_ticket_id;
    totp_secret := v_secret;
    qr_code := v_qr;
    unit_price := v_price;
    total_amount := v_subtotal;
    return next;
  end loop;
end;
$$;

revoke all on function public.create_pos_sale_tx(uuid, uuid, integer, text, uuid, text)
  from public;
grant execute on function public.create_pos_sale_tx(uuid, uuid, integer, text, uuid, text)
  to authenticated, service_role;
