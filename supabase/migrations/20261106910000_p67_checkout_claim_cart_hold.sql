-- P67: Checkout attaches a cart hold without resetting reserved_until.
-- Redefines reserve_seating_unit_tx and reserve_unified_cart_tx from P53/P63.

create or replace function public.reserve_seating_unit_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_tier_id uuid,
  p_seating_unit_id uuid,
  p_promoter_id uuid default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  seating_unit_id uuid,
  reserved_until timestamptz,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_unit public.event_seating_units%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_organizer_id uuid;
  v_rate numeric(5, 4);
  v_max_per_user integer := 10;
  v_owned_held integer := 0;
  v_order_id uuid := gen_random_uuid();
  v_secret text;
  v_hold_until timestamptz := now() + interval '8 minutes';
  v_qr_count integer;
  v_group_id uuid;
  v_slot integer;
  v_one_id uuid;
  v_ticket_ids uuid[] := '{}';
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_table_number integer;
begin
  perform set_config('lock_timeout', '4s', true);

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform public.expire_buyer_pending_event_orders(p_owner_id, p_event_id);

  if not public.event_is_buyable(p_event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select e.organizer_id, coalesce(e.max_tickets_per_user, 10)
    into v_organizer_id, v_max_per_user
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if v_organizer_id is null then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  select *
    into v_tier
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found
     or v_tier.event_id is distinct from p_event_id
     or v_tier.layout_type = 'general' then
    raise exception 'Tier de ubicación inválido'
      using errcode = '23514';
  end if;

  select *
    into v_unit
  from public.event_seating_units as u
  where u.id = p_seating_unit_id
    and u.event_id = p_event_id
    and u.tier_id = p_tier_id;

  if not found then
    raise exception 'Ubicación no encontrada'
      using errcode = 'P0002';
  end if;

  if v_tier.sold >= v_tier.capacity then
    raise exception 'Sold out' using errcode = 'P0001';
  end if;

  v_owned_held := public.count_user_event_tickets_for_limit(p_event_id, p_owner_id);

  if v_owned_held + 1 > v_max_per_user then
    raise exception 'MAX_TICKETS_PER_USER_EXCEEDED'
      using errcode = 'P0001';
  end if;

  if p_promoter_id is not null and not exists (
    select 1 from public.promoters as pr
    where pr.id = p_promoter_id
      and pr.organizer_id = v_organizer_id
  ) then
    raise exception 'Promoter inválido para este evento'
      using errcode = '23514';
  end if;

  v_table_number := coalesce(
    public.parse_seating_unit_table_number(v_unit.label),
    public.parse_seating_unit_table_number(v_unit.layout_item_id)
  );

  v_price := public.resolve_zone_tier_unit_price(
    p_event_id,
    p_tier_id,
    v_unit.sector_id,
    v_table_number,
    null
  );

  if v_price is null then
    v_price := round(v_tier.price, 2);
  end if;

  v_unit_fee := public.all_in_platform_fee_from_public(v_price, v_rate);

  v_qr_count := greatest(1, least(100, coalesce(v_unit.capacity_per_unit, 1)));
  v_group_id := case when v_qr_count > 1 then gen_random_uuid() else null end;

  insert into public.orders (
    id,
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    promoter_id
  )
  values (
    v_order_id,
    p_owner_id,
    round(v_price, 2),
    round(v_unit_fee, 2),
    round(v_price, 2),
    'pending',
    p_promoter_id
  );

  v_hold_until := public.claim_seating_unit_for_checkout(
    p_seating_unit_id,
    p_event_id,
    p_tier_id,
    p_owner_id,
    v_order_id,
    v_hold_until
  );

  update public.ticket_tiers
  set sold = sold + 1
  where id = p_tier_id;

  begin
    for v_slot in 1..v_qr_count loop
      v_secret := encode(extensions.gen_random_bytes(24), 'hex');

      insert into public.tickets (
        event_id,
        tier_id,
        owner_id,
        qr_code,
        totp_secret,
        status,
        order_id,
        seating_unit_id,
        group_id,
        group_slot,
        max_admissions,
        admissions_used
      )
      values (
        p_event_id,
        p_tier_id,
        p_owner_id,
        gen_random_uuid()::text,
        v_secret,
        'pending_payment'::public.ticket_status,
        v_order_id,
        p_seating_unit_id,
        v_group_id,
        case when v_qr_count > 1 then v_slot else null end,
        1,
        0
      )
      returning id into v_one_id;

      v_ticket_ids := array_append(v_ticket_ids, v_one_id);
    end loop;
  exception
    when unique_violation or check_violation then
      raise exception 'No se pudieron emitir los QRs de la ubicación'
        using errcode = 'P0001';
  end;

  if coalesce(array_length(v_ticket_ids, 1), 0) <> v_qr_count then
    raise exception 'No se pudieron emitir los QRs de la ubicación'
      using errcode = 'P0001';
  end if;

  begin
    perform public.fulfill_tier_combo_items(
      v_order_id,
      p_tier_id,
      p_owner_id,
      'pending'
    );
  exception
    when undefined_function then null;
  end;

  foreach v_one_id in array v_ticket_ids
  loop
    order_id := v_order_id;
    ticket_id := v_one_id;
    seating_unit_id := p_seating_unit_id;
    reserved_until := v_hold_until;
    subtotal := round(v_price, 2);
    service_charge := round(v_unit_fee, 2);
    total_amount := round(v_price, 2);
    return next;
  end loop;
end;
$$;

revoke all on function public.reserve_seating_unit_tx(uuid, uuid, uuid, uuid, uuid)
  from public;
grant execute on function public.reserve_seating_unit_tx(uuid, uuid, uuid, uuid, uuid)
  to authenticated, service_role;

-- Unified cart (seat + extras): same claim helper so the 8m clock is not reset.
