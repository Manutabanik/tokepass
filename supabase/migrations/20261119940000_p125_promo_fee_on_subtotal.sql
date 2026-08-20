-- P125 · A-F1: el cupón descuenta solo el subtotal del evento.
-- service_charge se recalcula con la tasa pactada sobre el nuevo subtotal.
-- Montos en numeric(12,2) / centavos enteros para evitar descalces de 0.01.

create or replace function public.compute_promo_discount(
  p_discount_type public.promo_discount_type,
  p_discount_value numeric,
  p_base_amount numeric
)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_base numeric(12, 2) := greatest(0, round(coalesce(p_base_amount, 0), 2));
  v_base_cents integer;
  v_discount_cents integer;
  v_value_cents integer;
begin
  if v_base <= 0 then
    return 0::numeric(12, 2);
  end if;

  v_base_cents := round(v_base * 100)::integer;

  if p_discount_type = 'percentage' then
    v_discount_cents := round(
      v_base_cents * greatest(0, coalesce(p_discount_value, 0)) / 100.0
    )::integer;
  else
    v_value_cents := round(greatest(0, coalesce(p_discount_value, 0)) * 100)::integer;
    v_discount_cents := v_value_cents;
  end if;

  v_discount_cents := greatest(0, least(v_base_cents, v_discount_cents));
  return (v_discount_cents::numeric / 100)::numeric(12, 2);
end;
$$;

create or replace function public.apply_promo_code_to_order(
  p_order_id uuid,
  p_owner_id uuid,
  p_promo_code_id uuid
)
returns table (
  ok boolean,
  discount_amount numeric,
  total_amount numeric,
  message text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_promo public.promo_codes%rowtype;
  v_ticket_event uuid;
  v_rate numeric;
  v_implied_net numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2);
  v_new_subtotal numeric(12, 2);
  v_new_service numeric(12, 2);
  v_new_total numeric(12, 2);
begin
  if p_order_id is null or p_owner_id is null or p_promo_code_id is null then
    return query select false, 0::numeric, 0::numeric, 'Datos de cupón incompletos.'::text;
    return;
  end if;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return query select false, 0::numeric, 0::numeric, 'Orden no encontrada.'::text;
    return;
  end if;

  if v_order.buyer_id is distinct from p_owner_id then
    return query select false, 0::numeric, 0::numeric, 'No podés modificar esta orden.'::text;
    return;
  end if;

  if v_order.status is distinct from 'pending' then
    return query select false, 0::numeric, 0::numeric, 'La orden ya no admite cupones.'::text;
    return;
  end if;

  if v_order.promo_code_id is not null then
    return query select false, coalesce(v_order.discount_amount, 0), v_order.total_amount,
      'La orden ya tiene un cupón aplicado.'::text;
    return;
  end if;

  select t.event_id
    into v_ticket_event
  from public.tickets as t
  where t.order_id = p_order_id
  limit 1;

  select *
    into v_promo
  from public.promo_codes as pc
  where pc.id = p_promo_code_id
  for update of pc;

  if not found then
    return query select false, 0::numeric, v_order.total_amount, 'Cupón no encontrado.'::text;
    return;
  end if;

  if v_ticket_event is null or v_promo.event_id is distinct from v_ticket_event then
    return query select false, 0::numeric, v_order.total_amount, 'Cupón inválido para este evento.'::text;
    return;
  end if;

  if not v_promo.is_active then
    return query select false, 0::numeric, v_order.total_amount, 'Este cupón está inactivo.'::text;
    return;
  end if;

  if v_promo.valid_until is not null and v_promo.valid_until < now() then
    return query select false, 0::numeric, v_order.total_amount, 'Este cupón ya venció.'::text;
    return;
  end if;

  if v_promo.max_uses is not null and v_promo.current_uses >= v_promo.max_uses then
    return query select false, 0::numeric, v_order.total_amount, 'Este cupón agotó sus usos.'::text;
    return;
  end if;

  v_subtotal := round(coalesce(v_order.subtotal, 0), 2)::numeric(12, 2);

  v_discount := public.compute_promo_discount(
    v_promo.discount_type,
    v_promo.discount_value,
    v_subtotal
  );

  if v_discount <= 0 then
    return query select false, 0::numeric, v_order.total_amount, 'El carrito no admite descuento.'::text;
    return;
  end if;

  -- Solo el subtotal del evento. Nunca restar el cupón del fee ni del total crudo.
  v_new_subtotal := greatest(0::numeric, v_subtotal - v_discount)::numeric(12, 2);
  v_rate := public.get_event_service_charge_rate(v_ticket_event);
  v_implied_net := greatest(
    0::numeric,
    v_new_subtotal - public.all_in_platform_fee_from_public(v_new_subtotal, v_rate)
  )::numeric(12, 2);

  -- all_in_platform_fee(nuevo_subtotal_neto, rate) + fixed pactado del evento.
  -- Misma liquidación que reserve: all_in_platform_fee_for_event.
  v_new_service := public.all_in_platform_fee(v_implied_net, v_rate)::numeric(12, 2);
  if v_new_subtotal > 0 then
    v_new_service := least(
      v_new_subtotal,
      v_new_service + public.get_event_platform_fixed_fee(v_ticket_event)
    )::numeric(12, 2);
  end if;

  -- All-In: el comprador paga el subtotal público remanente; el fee queda dentro.
  v_new_total := v_new_subtotal;

  update public.orders
  set
    promo_code_id = v_promo.id,
    discount_amount = v_discount,
    subtotal = v_new_subtotal,
    service_charge = v_new_service,
    total_amount = v_new_total,
    updated_at = now()
  where id = p_order_id;

  update public.promo_codes
  set
    current_uses = current_uses + 1,
    updated_at = now()
  where id = v_promo.id;

  return query select true, v_discount, v_new_total, 'Cupón aplicado.'::text;
end;
$$;

revoke all on function public.apply_promo_code_to_order(uuid, uuid, uuid) from public;
grant execute on function public.apply_promo_code_to_order(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public.apply_promo_code_to_order(uuid, uuid, uuid) is
  'A-F1: descuenta solo orders.subtotal y recalcula service_charge con la tasa pactada All-In.';
