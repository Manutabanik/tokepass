-- =============================================================================
-- Tokepass · Universal Multi-Pasarela (agnostic payment schema)
-- 2026-08-14
--
-- Agrega payment_provider + IDs genericos en orders, ledger de webhooks
-- multi-PSP, y sobrecarga de finalize_paid_order.
-- Conserva mp_preference_id / mp_payment_id y la firma (uuid, text) para
-- no romper webhooks y checkout actuales.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Enum de proveedores (extensible via ALTER TYPE ... ADD VALUE)
-- -----------------------------------------------------------------------------
do $$
begin
  create type public.payment_provider_type as enum (
    'mercadopago',
    'payway',
    'naranjax',
    'modo',
    'nave',
    'stripe',
    'bank_transfer',
    'pos_cash',
    'pos_card',
    'sandbox',
    'free'
  );
exception
  when duplicate_object then null;
end;
$$;

comment on type public.payment_provider_type is
  'PSP / canal de cobro de una orden. Extender con ALTER TYPE ... ADD VALUE.';

-- -----------------------------------------------------------------------------
-- 2) Columnas genericas en orders
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists payment_provider public.payment_provider_type
    not null default 'mercadopago';

alter table public.orders
  add column if not exists provider_preference_id text;

alter table public.orders
  add column if not exists provider_transaction_id text;

alter table public.orders
  add column if not exists installment_plan text;

alter table public.orders
  add column if not exists provider_metadata jsonb
    not null default '{}'::jsonb;

comment on column public.orders.payment_provider is
  'Pasarela o canal que cobro (o cobrara) la orden.';
comment on column public.orders.provider_preference_id is
  'ID de sesion/preferencia/checkout del PSP (Checkout Pro preference, Stripe session, etc.).';
comment on column public.orders.provider_transaction_id is
  'ID de transaccion/pago confirmado del PSP.';
comment on column public.orders.installment_plan is
  'Plan de cuotas informado por el PSP, si aplica.';
comment on column public.orders.provider_metadata is
  'Payload auxiliar del PSP (no PII de tarjetas).';

-- -----------------------------------------------------------------------------
-- 3) Backfill sin perdida (MP + sandbox + POS + free)
-- -----------------------------------------------------------------------------
update public.orders
set provider_preference_id = mp_preference_id
where mp_preference_id is not null
  and provider_preference_id is null;

update public.orders
set provider_transaction_id = mp_payment_id
where mp_payment_id is not null
  and provider_transaction_id is null;

update public.orders
set payment_provider = 'mercadopago'
where payment_method = 'mercadopago';

update public.orders
set payment_provider = 'sandbox'
where payment_method = 'test_sandbox';

update public.orders
set payment_provider = 'pos_cash'
where payment_method = 'cash_pos';

update public.orders
set payment_provider = 'pos_card'
where payment_method = 'card_pos';

update public.orders
set payment_provider = 'bank_transfer'
where payment_method = 'transfer_pos';

update public.orders
set payment_provider = 'sandbox'
where mp_payment_id like 'sandbox:%';

update public.orders
set payment_provider = 'free'
where mp_payment_id like 'free:%';

-- -----------------------------------------------------------------------------
-- 4) Indices parciales (alta concurrencia / idempotencia de cobro)
-- -----------------------------------------------------------------------------
create index if not exists idx_orders_provider_tx
  on public.orders (payment_provider, provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists idx_orders_provider_pref
  on public.orders (payment_provider, provider_preference_id)
  where provider_preference_id is not null;

-- -----------------------------------------------------------------------------
-- 5) Ledger generico de webhooks
-- -----------------------------------------------------------------------------
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider public.payment_provider_type not null,
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  constraint unique_provider_event unique (provider, external_event_id)
);

comment on table public.payment_webhook_events is
  'Idempotencia de notificaciones por (provider, external_event_id). Convive con mp_webhook_events.';

alter table public.payment_webhook_events enable row level security;

revoke all on table public.payment_webhook_events from public;
revoke all on table public.payment_webhook_events from anon;
revoke all on table public.payment_webhook_events from authenticated;
grant all on table public.payment_webhook_events to service_role;

insert into public.payment_webhook_events (
  provider,
  external_event_id,
  event_type,
  payload,
  processed_at
)
select
  'mercadopago'::public.payment_provider_type,
  e.payment_id,
  coalesce(nullif(btrim(e.status), ''), 'unknown'),
  coalesce(e.raw_summary, '{}'::jsonb),
  e.processed_at
from public.mp_webhook_events as e
on conflict on constraint unique_provider_event do nothing;

-- -----------------------------------------------------------------------------
-- 6) RPC generica finalize_paid_order (uuid, text, text, jsonb)
--    Misma semantica que (uuid, text): activa tickets pending_payment,
--    respeta hold de seating, no re-incrementa sold (ya se desconto en reserve).
-- -----------------------------------------------------------------------------
create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_provider text,
  p_transaction_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_order public.orders%rowtype;
  v_pending_tickets integer := 0;
  v_valid_tickets integer := 0;
  v_activated integer := 0;
  v_updated integer := 0;
  v_tier_id uuid;
  v_count integer;
  v_provider public.payment_provider_type;
  v_tx text;
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
      return jsonb_build_object(
        'ok', false,
        'code', 'invalid_provider',
        'provider', p_provider
      );
  end;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  select count(*)::integer into v_pending_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'pending_payment'::public.ticket_status;

  select count(*)::integer into v_valid_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'valid'::public.ticket_status;

  if v_order.status = 'paid'
     and (
       v_order.provider_transaction_id is not distinct from v_tx
       or v_order.mp_payment_id is not distinct from v_tx
     ) then
    if v_pending_tickets > 0 then
      if exists (
        select 1
        from public.tickets as t
        join public.event_seating_units as u on u.id = t.seating_unit_id
        where t.order_id = p_order_id
          and t.status = 'pending_payment'::public.ticket_status
          and (
            u.status <> 'reserved'
            or u.reserved_order_id is distinct from p_order_id
            or u.reserved_until <= now()
          )
      ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'order_expired',
          'needs_refund', true
        );
      end if;

      update public.tickets
      set status = 'valid'::public.ticket_status, updated_at = now()
      where order_id = p_order_id
        and status = 'pending_payment'::public.ticket_status;
    end if;

    begin
      perform public.activate_order_item_redemptions(p_order_id);
    exception when undefined_function then null;
    end;

    return jsonb_build_object(
      'ok', true,
      'code', 'already_paid',
      'idempotent', true,
      'payment_provider', v_order.payment_provider::text
    );
  end if;

  if v_order.status = 'paid'
     and v_order.provider_transaction_id is distinct from v_tx
     and v_order.mp_payment_id is distinct from v_tx then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_paid_other_payment',
      'mp_payment_id', v_order.mp_payment_id,
      'provider_transaction_id', v_order.provider_transaction_id
    );
  end if;

  if v_order.status = 'expired' then
    return jsonb_build_object(
      'ok', false,
      'code', 'order_expired',
      'needs_refund', true
    );
  end if;

  if v_order.status is distinct from 'pending' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'status', v_order.status
    );
  end if;

  if exists (
    select 1
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.order_id = p_order_id
      and not public.is_approved_organizer(e.organizer_id)
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'organizer_suspended',
      'needs_refund', true
    );
  end if;

  if exists (
    select 1
    from public.tickets as t
    join public.event_seating_units as u on u.id = t.seating_unit_id
    where t.order_id = p_order_id
      and (
        u.status <> 'reserved'
        or u.reserved_order_id is distinct from p_order_id
        or u.reserved_until <= now()
      )
  ) then
    for v_tier_id, v_count in
      select s.tier_id, s.unit_count
      from public.count_pending_order_sold_units(p_order_id) as s
    loop
      update public.ticket_tiers
      set sold = greatest(0, sold - v_count)
      where id = v_tier_id;
    end loop;

    update public.tickets
    set status = 'cancelled'::public.ticket_status, updated_at = now()
    where order_id = p_order_id
      and status = 'pending_payment'::public.ticket_status;

    update public.orders
    set status = 'expired', updated_at = now()
    where id = p_order_id and status = 'pending';

    return jsonb_build_object(
      'ok', false,
      'code', 'seating_hold_expired',
      'needs_refund', true
    );
  end if;

  if v_pending_tickets = 0 and v_valid_tickets = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_tickets',
      'needs_refund', true
    );
  end if;

  if v_pending_tickets > 0 then
    update public.tickets
    set status = 'valid'::public.ticket_status, updated_at = now()
    where order_id = p_order_id
      and status = 'pending_payment'::public.ticket_status;

    get diagnostics v_activated = row_count;
    if v_activated is distinct from v_pending_tickets then
      raise exception 'TICKET_ACTIVATION_MISMATCH'
        using errcode = 'P0001';
    end if;
  end if;

  begin
    perform public.activate_order_item_redemptions(p_order_id);
  exception when undefined_function then null;
  end;

  update public.orders
  set
    status = 'paid',
    payment_provider = v_provider,
    provider_transaction_id = v_tx,
    mp_payment_id = v_tx,
    provider_metadata =
      coalesce(provider_metadata, '{}'::jsonb)
      || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  where id = p_order_id and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'ORDER_STATUS_RACE' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'paid',
    'tickets_activated', coalesce(v_activated, 0),
    'idempotent', false,
    'payment_provider', v_provider::text,
    'provider_transaction_id', v_tx
  );
end;
$$;

comment on function public.finalize_paid_order(uuid, text, text, jsonb) is
  'Confirma una orden pending de forma agnostica al PSP. Escribe provider_* y mp_payment_id (compat).';

revoke all on function public.finalize_paid_order(uuid, text, text, jsonb) from public;
revoke all on function public.finalize_paid_order(uuid, text, text, jsonb)
  from anon, authenticated;
grant execute on function public.finalize_paid_order(uuid, text, text, jsonb)
  to service_role;

-- Firma legacy: Mercado Pago / sandbox / free via prefijo del payment id
create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_mp_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_provider text := 'mercadopago';
  v_tx text := btrim(coalesce(p_mp_payment_id, ''));
begin
  if v_tx like 'sandbox:%' then
    v_provider := 'sandbox';
  elsif v_tx like 'free:%' then
    v_provider := 'free';
  end if;

  return public.finalize_paid_order(
    p_order_id := p_order_id,
    p_provider := v_provider,
    p_transaction_id := v_tx,
    p_metadata := '{}'::jsonb
  );
end;
$$;

comment on function public.finalize_paid_order(uuid, text) is
  'Compatibilidad MP: delega en finalize_paid_order(uuid, text, text, jsonb).';

revoke all on function public.finalize_paid_order(uuid, text) from public;
revoke all on function public.finalize_paid_order(uuid, text)
  from anon, authenticated;
grant execute on function public.finalize_paid_order(uuid, text)
  to service_role;
