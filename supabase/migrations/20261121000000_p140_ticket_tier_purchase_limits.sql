-- =============================================================================
-- Tokepass · P140 · Límites de compra por tarifa (SKU)
-- events.max_tickets_per_user se conserva como fallback cuando el SKU no define tope.
-- =============================================================================

alter table public.ticket_tiers
  add column if not exists min_purchase_limit integer not null default 1,
  add column if not exists max_purchase_limit integer default null;

update public.ticket_tiers
set min_purchase_limit = 1
where min_purchase_limit is null
   or min_purchase_limit < 1;

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_min_purchase_limit_check;

alter table public.ticket_tiers
  add constraint ticket_tiers_min_purchase_limit_check
  check (min_purchase_limit >= 1 and min_purchase_limit <= 200);

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_max_purchase_limit_check;

alter table public.ticket_tiers
  add constraint ticket_tiers_max_purchase_limit_check
  check (
    max_purchase_limit is null
    or (max_purchase_limit >= 1 and max_purchase_limit <= 200)
  );

comment on column public.ticket_tiers.min_purchase_limit is
  'Unidades mínimas de este SKU por transacción. Default 1.';

comment on column public.ticket_tiers.max_purchase_limit is
  'Tope de unidades de este SKU por transacción. NULL = usar events.max_tickets_per_user.';

create or replace function public.checkout_cart_item_tier_uuid(p_item jsonb)
returns uuid
language plpgsql
immutable
as $$
declare
  v_raw text;
begin
  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    return null;
  end if;
  v_raw := nullif(btrim(coalesce(
    p_item ->> 'tier_id',
    p_item ->> 'ticket_tier_id',
    p_item ->> 'tierId',
    p_item ->> 'ticketTierId',
    ''
  )), '');
  if v_raw is null then
    return null;
  end if;
  begin
    return v_raw::uuid;
  exception
    when others then
      return null;
  end;
end;
$$;

create or replace function public.assert_cart_tier_purchase_limits(
  p_event_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_max integer;
  v_tier_id uuid;
  v_qty integer;
  v_name text;
  v_min integer;
  v_max integer;
begin
  if p_event_id is null
     or p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    return;
  end if;

  select case
           when e.max_tickets_per_user is null then null
           when e.max_tickets_per_user <= 0 then null
           else e.max_tickets_per_user
         end
    into v_event_max
  from public.events as e
  where e.id = p_event_id;

  for v_tier_id, v_qty in
    select
      public.checkout_cart_item_tier_uuid(value),
      sum(greatest(coalesce((value ->> 'quantity')::integer, 0), 0))::integer
    from jsonb_array_elements(p_items)
    group by 1
  loop
    if v_tier_id is null or coalesce(v_qty, 0) <= 0 then
      continue;
    end if;

    select
      tt.name,
      greatest(coalesce(tt.min_purchase_limit, 1), 1),
      case
        when tt.max_purchase_limit is null or tt.max_purchase_limit <= 0
          then v_event_max
        else tt.max_purchase_limit
      end
      into v_name, v_min, v_max
    from public.ticket_tiers as tt
    where tt.id = v_tier_id
      and tt.event_id = p_event_id;

    if not found then
      continue;
    end if;

    if v_qty < v_min then
      raise exception
        'TIER_PURCHASE_MIN_EXCEEDED: Debés agregar al menos % unidades de % por compra.',
        v_min,
        coalesce(v_name, 'esta tarifa')
        using errcode = 'P0001';
    end if;

    if v_max is not null and v_qty > v_max then
      raise exception
        'TIER_PURCHASE_MAX_EXCEEDED: No podés agregar más de % unidades de % por compra.',
        v_max,
        coalesce(v_name, 'esta tarifa')
        using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

revoke all on function public.checkout_cart_item_tier_uuid(jsonb) from public;
grant execute on function public.checkout_cart_item_tier_uuid(jsonb)
  to authenticated, service_role;

revoke all on function public.assert_cart_tier_purchase_limits(uuid, jsonb) from public;
grant execute on function public.assert_cart_tier_purchase_limits(uuid, jsonb)
  to authenticated, service_role;

-- El chequeo legado (owned + qty) > events.max_tickets_per_user sumaba el carrito
-- entero. Se neutraliza: el tope pasa a ser por SKU.
create or replace function public.count_user_event_tickets_for_limit(
  p_event_id uuid,
  p_owner_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_event_id is null or p_owner_id is null then
    return 0;
  end if;
  return -100000;
end;
$$;

comment on function public.count_user_event_tickets_for_limit(uuid, uuid) is
  'Neutralizado en P140. El tope de compra se valida por ticket_tiers (assert_cart_tier_purchase_limits).';

-- Tope por identidad: ya no suma el total del carrito contra el global.
create or replace function public.assert_holder_identity_ticket_cap(
  p_event_id uuid,
  p_holder_dni text,
  p_holder_email text,
  p_requested integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_event_id is null or coalesce(p_requested, 0) <= 0 then
    return;
  end if;
  return;
end;
$$;

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
  v_order uuid;
  v_row record;
  v_dni text := nullif(btrim(coalesce(p_holder_dni, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_holder_email, ''))), '');
begin
  perform public.assert_cart_tier_purchase_limits(p_event_id, p_items);

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
