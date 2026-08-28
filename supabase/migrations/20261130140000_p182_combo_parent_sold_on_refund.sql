-- P182 · Al reembolsar un combo explotado, devolver sold del SKU padre.

create or replace function public.restore_combo_parent_sold_for_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_combo uuid;
  v_tickets integer;
  v_parts integer;
  v_packs integer;
begin
  if p_order_id is null then
    return;
  end if;

  for v_combo, v_tickets in
    select t.source_combo_tier_id, count(*)::integer
    from public.tickets as t
    where t.order_id = p_order_id
      and t.status = 'valid'::public.ticket_status
      and t.source_combo_tier_id is not null
    group by t.source_combo_tier_id
  loop
    select count(*)::integer
      into v_parts
    from public.combo_parts_for_tier(v_combo);
    v_parts := greatest(1, coalesce(v_parts, 1));
    v_packs := v_tickets / v_parts;
    if v_packs > 0 then
      update public.ticket_tiers
      set
        sold = greatest(0, sold - v_packs),
        updated_at = now()
      where id = v_combo;
    end if;
  end loop;
end;
$$;

revoke all on function public.restore_combo_parent_sold_for_order(uuid)
  from public, anon, authenticated;
grant execute on function public.restore_combo_parent_sold_for_order(uuid)
  to service_role;

create or replace function public.restore_combo_parent_sold_after_losing_ticket(
  p_order_id uuid,
  p_source_combo_tier_id uuid,
  p_ticket_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_left integer := 0;
  v_parts integer := 1;
  v_dec integer := 0;
begin
  if p_source_combo_tier_id is null or p_ticket_id is null then
    return;
  end if;

  select count(*)::integer
    into v_left
  from public.tickets
  where order_id is not distinct from p_order_id
    and source_combo_tier_id = p_source_combo_tier_id
    and status = 'valid'::public.ticket_status
    and id is distinct from p_ticket_id;

  select count(*)::integer
    into v_parts
  from public.combo_parts_for_tier(p_source_combo_tier_id);
  v_parts := greatest(1, coalesce(v_parts, 1));
  v_dec := ((coalesce(v_left, 0) + 1) / v_parts) - (coalesce(v_left, 0) / v_parts);

  if v_dec > 0 then
    update public.ticket_tiers
    set
      sold = greatest(0, sold - v_dec),
      updated_at = now()
    where id = p_source_combo_tier_id;
  end if;
end;
$$;

revoke all on function public.restore_combo_parent_sold_after_losing_ticket(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.restore_combo_parent_sold_after_losing_ticket(uuid, uuid, uuid)
  to service_role;

create or replace function public.refund_single_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_ticket_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  select *
    into v_ticket
  from public.tickets
  where id = p_ticket_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_ticket.status in (
    'refunded'::public.ticket_status,
    'cancelled'::public.ticket_status,
    'revoked'::public.ticket_status
  ) then
    return jsonb_build_object(
      'ok', true,
      'code', 'already_refunded',
      'idempotent', true,
      'ticket_id', v_ticket.id,
      'order_id', v_ticket.order_id
    );
  end if;

  if v_ticket.status = 'valid'::public.ticket_status then
    update public.ticket_tiers
    set sold = greatest(0, sold - 1)
    where id = v_ticket.tier_id;

    if v_ticket.source_combo_tier_id is not null then
      perform public.restore_combo_parent_sold_after_losing_ticket(
        v_ticket.order_id,
        v_ticket.source_combo_tier_id,
        v_ticket.id
      );
    end if;

    if v_ticket.seating_unit_id is not null then
      update public.event_seating_units
      set
        status = 'available',
        sold_order_id = null,
        reserved_by = null,
        reserved_order_id = null,
        reserved_until = null,
        updated_at = now()
      where id = v_ticket.seating_unit_id
        and status = 'sold';
    end if;
  end if;

  update public.tickets
  set
    status = 'refunded'::public.ticket_status,
    totp_secret = 'dead-rf-' || encode(gen_random_bytes(12), 'hex'),
    updated_at = now()
  where id = p_ticket_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'refunded',
    'ticket_id', v_ticket.id,
    'order_id', v_ticket.order_id
  );
end;
$$;

comment on function public.refund_single_ticket(uuid) is
  'Anula un ticket (refunded) y libera stock/asiento. No cambia orders.status.';

revoke all on function public.refund_single_ticket(uuid)
  from public, anon, authenticated;
grant execute on function public.refund_single_ticket(uuid) to service_role;

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

  perform public.restore_combo_parent_sold_for_order(p_order_id);

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
    status = case
      when status = 'pending_payment'::public.ticket_status
        then 'cancelled'::public.ticket_status
      else 'refunded'::public.ticket_status
    end,
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

  perform public.restore_combo_parent_sold_for_order(p_order_id);

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
    status = 'refunded'::public.ticket_status,
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
