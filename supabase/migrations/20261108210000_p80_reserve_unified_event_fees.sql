-- P80b: Event All-In fees + cascade + GA hold convert on unified/seating reserves.

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

  perform public.assert_cascade_stock_available(
    p_event_id,
    p_tier_id,
    1,
    null
  );

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

  v_unit_fee := public.all_in_platform_fee_for_event(p_event_id, v_price);

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

create or replace function public.reserve_unified_cart_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid default null
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
  v_item jsonb;
  v_child jsonb;
  v_tier_id uuid;
  v_child_id uuid;
  v_quantity integer;
  v_child_qty integer;
  v_phase_id uuid;
  v_admit integer;
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event_id uuid;
  v_organizer_id uuid;
  v_subtotal numeric(12, 2) := 0;
  v_service_charge numeric(12, 2) := 0;
  v_total_amount numeric(12, 2) := 0;
  v_order_id uuid;
  v_ticket_ids uuid[] := '{}';
  v_unit integer;
  v_slot integer;
  v_one_id uuid;
  v_group_id uuid;
  v_requested integer := 0;
  v_owned_held integer := 0;
  v_max_per_user integer := 10;
  v_secret text;
  v_sector_key text;
  v_table_number integer;
  v_zone_id uuid;
  v_seating_unit_id uuid;
  v_seating_count integer := 0;
  v_hold_until timestamptz := now() + interval '8 minutes';
  v_unit_row public.event_seating_units%rowtype;
  v_qr_count integer;
  v_layout_type text;
  v_tier_type text;
  v_bundle_items jsonb;
  v_child_event uuid;
  v_child_type text;
  v_child_layout text;
  v_child_cap integer;
  v_child_sold integer;
begin
  perform set_config('lock_timeout', '4s', true);

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if p_event_id is null or p_owner_id is null then
    raise exception 'event_id y owner_id son obligatorios'
      using errcode = '22023';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Debés indicar al menos un ítem de compra'
      using errcode = '22023';
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

  select coalesce(sum(coalesce((value ->> 'quantity')::integer, 0)), 0)
    into v_requested
  from jsonb_array_elements(p_items);

  v_owned_held := public.count_user_event_tickets_for_limit(p_event_id, p_owner_id);

  if (v_owned_held + v_requested) > v_max_per_user then
    raise exception 'MAX_TICKETS_PER_USER_EXCEEDED'
      using errcode = 'P0001';
  end if;

  if p_promoter_id is not null then
    if not exists (
      select 1
      from public.promoters as pr
      where pr.id = p_promoter_id
        and pr.organizer_id = v_organizer_id
    ) then
      raise exception 'Promoter inválido para este evento'
        using errcode = '23514';
    end if;
  end if;

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    promoter_id
  )
  values (
    p_owner_id,
    0,
    0,
    0,
    'pending',
    p_promoter_id
  )
  returning id into v_order_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_tier_id := (v_item ->> 'tier_id')::uuid;
    exception
      when others then
        raise exception 'tier_id inválido' using errcode = '22P02';
    end;

    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    v_sector_key := nullif(btrim(v_item ->> 'sector_key'), '');
    v_table_number := nullif(v_item ->> 'table_number', '')::integer;
    begin
      v_zone_id := nullif(v_item ->> 'zone_id', '')::uuid;
    exception
      when others then
        v_zone_id := null;
    end;
    begin
      v_seating_unit_id := nullif(v_item ->> 'seating_unit_id', '')::uuid;
    exception
      when others then
        v_seating_unit_id := null;
    end;
    begin
      v_phase_id := nullif(v_item ->> 'phase_id', '')::uuid;
    exception
      when others then
        v_phase_id := null;
    end;

    if v_tier_id is null or v_quantity <= 0 then
      raise exception 'Cada ítem requiere tier_id y quantity > 0'
        using errcode = '22023';
    end if;

    select
      tt.event_id,
      tt.capacity,
      tt.sold,
      greatest(1, least(50, coalesce(tt.admit_count, 1))),
      tt.layout_type,
      coalesce(tt.tier_type, 'general'),
      tt.bundle_items
      into
        v_tier_event_id,
        v_capacity,
        v_sold,
        v_admit,
        v_layout_type,
        v_tier_type,
        v_bundle_items
    from public.ticket_tiers as tt
    where tt.id = v_tier_id
    for update of tt;

    if not found then
      raise exception 'Ticket tier not found'
        using errcode = 'P0002';
    end if;

    if v_tier_event_id is distinct from p_event_id then
      raise exception 'El tier no pertenece al evento'
        using errcode = '23514';
    end if;

    if v_seating_unit_id is not null then
      v_seating_count := v_seating_count + 1;
      if v_seating_count > 1 or v_quantity <> 1 then
        raise exception 'Comprá una ubicación numerada por operación'
          using errcode = '23514';
      end if;
      if v_tier_type is distinct from 'seated' and v_layout_type = 'general' then
        raise exception 'Tier de ubicación inválido'
          using errcode = '23514';
      end if;

      select *
        into v_unit_row
      from public.event_seating_units as u
      where u.id = v_seating_unit_id
        and u.event_id = p_event_id
        and u.tier_id = v_tier_id;

      if not found then
        raise exception 'Ubicación no encontrada'
          using errcode = 'P0002';
      end if;

      perform public.assert_cascade_stock_available(
        p_event_id,
        v_tier_id,
        1,
        v_phase_id
      );

      v_table_number := coalesce(
        v_table_number,
        public.parse_seating_unit_table_number(v_unit_row.label),
        public.parse_seating_unit_table_number(v_unit_row.layout_item_id)
      );
      v_sector_key := coalesce(v_sector_key, v_unit_row.sector_id);

      v_price := public.resolve_zone_tier_unit_price(
        p_event_id,
        v_tier_id,
        v_sector_key,
        v_table_number,
        v_zone_id
      );

      if v_price is null then
        select round(tt.price, 2) into v_price
        from public.ticket_tiers as tt
        where tt.id = v_tier_id;
      end if;

      v_unit_fee := public.all_in_platform_fee_for_event(p_event_id, v_price);

      v_hold_until := public.claim_seating_unit_for_checkout(
        v_seating_unit_id,
        p_event_id,
        v_tier_id,
        p_owner_id,
        v_order_id,
        v_hold_until
      );

      update public.ticket_tiers
      set sold = sold + 1
      where id = v_tier_id;

      v_subtotal := v_subtotal + v_price;
      v_service_charge := v_service_charge + v_unit_fee;

      v_qr_count := greatest(1, least(100, coalesce(v_unit_row.capacity_per_unit, 1)));
      v_group_id := case when v_qr_count > 1 then gen_random_uuid() else null end;

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
          v_tier_id,
          p_owner_id,
          gen_random_uuid()::text,
          v_secret,
          'pending_payment'::public.ticket_status,
          v_order_id,
          v_seating_unit_id,
          v_group_id,
          case when v_qr_count > 1 then v_slot else null end,
          1,
          0
        )
        returning id into v_one_id;

        v_ticket_ids := array_append(v_ticket_ids, v_one_id);
      end loop;

      continue;
    end if;

    v_price := public.resolve_zone_tier_unit_price(
      p_event_id,
      v_tier_id,
      v_sector_key,
      v_table_number,
      v_zone_id
    );

    if v_price is null then
      raise exception 'Ticket tier not found'
        using errcode = 'P0002';
    end if;

    v_unit_fee := public.all_in_platform_fee_for_event(p_event_id, v_price);

    if v_tier_type = 'bundle' and jsonb_typeof(v_bundle_items) = 'array' then
      for v_child in
        select value from jsonb_array_elements(v_bundle_items)
      loop
        begin
          v_child_id := coalesce(
            nullif(v_child ->> 'tier_id', ''),
            nullif(v_child ->> 'tierId', '')
          )::uuid;
        exception
          when others then
            v_child_id := null;
        end;
        v_child_qty := coalesce((v_child ->> 'quantity')::integer, 0) * v_quantity;
        if v_child_id is null or v_child_qty <= 0 then
          continue;
        end if;

        select
          tt.event_id,
          coalesce(tt.tier_type, 'general'),
          tt.layout_type,
          tt.capacity,
          tt.sold
          into v_child_event, v_child_type, v_child_layout, v_child_cap, v_child_sold
        from public.ticket_tiers as tt
        where tt.id = v_child_id
        for update of tt;

        if not found or v_child_event is distinct from p_event_id then
          raise exception 'El combo incluye un ítem inválido'
            using errcode = '23514';
        end if;

        if v_child_type = 'seated' or v_child_layout in ('numbered_seat', 'table_combo') then
          raise exception 'Los combos no reservan asientos numerados automáticamente'
            using errcode = '23514';
        end if;

        perform public.assert_cascade_stock_available(
          p_event_id,
          v_child_id,
          v_child_qty,
          null
        );

        update public.ticket_tiers
        set sold = sold + v_child_qty
        where id = v_child_id;
      end loop;
    end if;

    perform public.apply_ga_stock_for_reserve(
      p_event_id,
      p_owner_id,
      v_tier_id,
      v_quantity,
      v_phase_id
    );

    v_subtotal := v_subtotal + (v_price * v_quantity);
    v_service_charge := v_service_charge + (v_unit_fee * v_quantity);

    for v_unit in 1..v_quantity loop
      v_group_id := case when v_admit > 1 then gen_random_uuid() else null end;

      for v_slot in 1..v_admit loop
        v_secret := encode(extensions.gen_random_bytes(24), 'hex');

        insert into public.tickets (
          event_id,
          tier_id,
          owner_id,
          qr_code,
          totp_secret,
          status,
          order_id,
          group_id,
          group_slot,
          max_admissions,
          admissions_used,
          ticket_type
        )
        values (
          p_event_id,
          v_tier_id,
          p_owner_id,
          gen_random_uuid()::text,
          v_secret,
          'pending_payment'::public.ticket_status,
          v_order_id,
          v_group_id,
          case when v_admit > 1 then v_slot else null end,
          1,
          0,
          case
            when v_tier_type = 'addon' then 'access_pass'::public.ticket_type
            else 'admission'::public.ticket_type
          end
        )
        returning id into v_one_id;

        v_ticket_ids := array_append(v_ticket_ids, v_one_id);
      end loop;

      perform public.fulfill_tier_combo_items(
        v_order_id,
        v_tier_id,
        p_owner_id,
        'pending'
      );
    end loop;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_service_charge := round(v_service_charge, 2);
  v_total_amount := v_subtotal;

  update public.orders
  set
    subtotal = v_subtotal,
    service_charge = v_service_charge,
    total_amount = v_total_amount,
    updated_at = now()
  where id = v_order_id;

  foreach v_one_id in array v_ticket_ids
  loop
    order_id := v_order_id;
    ticket_id := v_one_id;
    subtotal := v_subtotal;
    service_charge := v_service_charge;
    total_amount := v_total_amount;
    return next;
  end loop;
end;
$$;
