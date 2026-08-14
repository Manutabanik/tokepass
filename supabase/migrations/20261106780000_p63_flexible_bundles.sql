-- P63 Flexible bundles: multi-day passes, cross-sell packs, volume discounts.
-- Sellable SKU remains ticket_tiers (tier_type = bundle). Views expose the
-- document shape { id, event_id, name, bundle_type, price, original_price, items }.

alter table public.ticket_tiers
  add column if not exists bundle_type text;

update public.ticket_tiers
set bundle_type = case
  when coalesce(bundle_type, '') <> '' then bundle_type
  when tier_type = 'bundle' and day_id is null then 'multi_day_pass'
  when tier_type = 'bundle' then 'cross_sell_pack'
  when category = 'bundle' and day_id is null then 'multi_day_pass'
  when category = 'bundle' then 'cross_sell_pack'
  else null
end
where tier_type = 'bundle' or category = 'bundle';

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_bundle_type_check;

alter table public.ticket_tiers
  add constraint ticket_tiers_bundle_type_check
  check (
    bundle_type is null
    or bundle_type in ('multi_day_pass', 'cross_sell_pack', 'volume_discount')
  );

comment on column public.ticket_tiers.bundle_type is
  'multi_day_pass | cross_sell_pack | volume_discount. Solo aplica a combos.';

create or replace view public.event_bundles as
select
  tt.id,
  tt.event_id,
  tt.name,
  coalesce(tt.bundle_type, 'cross_sell_pack') as bundle_type,
  tt.price,
  tt.list_price as original_price,
  tt.capacity,
  tt.sold,
  coalesce(tt.bundle_items, '[]'::jsonb) as items,
  tt.created_at,
  tt.updated_at
from public.ticket_tiers as tt
where tt.tier_type = 'bundle' or tt.category = 'bundle';

comment on view public.event_bundles is
  'Combos vendibles. items = [{tier_id, quantity}]. Precio promocional = price.';

grant select on public.event_bundles to authenticated, service_role;

-- Combos may consume seated *capacity* (packs de mesas) without locking a unit.
-- -----------------------------------------------------------------------------
-- reserve_unified_cart_tx (redefine): seated children decrement sold only.
-- -----------------------------------------------------------------------------
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
  v_admit integer;
  v_price numeric(12, 2);
  v_unit_fee numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event_id uuid;
  v_organizer_id uuid;
  v_rate numeric(5, 4);
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

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_organizer_id;

  if v_rate is null then
    v_rate := 0.15;
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
      coalesce(tt.bundle_items, '[]'::jsonb)
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

      if v_unit_row.status = 'reserved'
         and v_unit_row.reserved_until <= now()
         and v_unit_row.reserved_order_id is not null then
        perform public.expire_seating_order(v_unit_row.reserved_order_id);
      end if;

      begin
        select * into v_unit_row
        from public.event_seating_units
        where id = v_seating_unit_id
          and event_id = p_event_id
          and tier_id = v_tier_id
        for update;
      exception
        when lock_not_available then
          raise exception 'SEATING_UNIT_UNAVAILABLE'
            using errcode = 'P0001';
      end;

      if v_unit_row.status <> 'available' then
        raise exception 'SEATING_UNIT_UNAVAILABLE'
          using errcode = 'P0001';
      end if;

      if (v_capacity - v_sold) < 1 then
        raise exception 'Sold out'
          using errcode = 'P0001';
      end if;

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

      v_unit_fee := public.all_in_platform_fee_from_public(v_price, v_rate);

      update public.event_seating_units
      set
        status = 'reserved',
        reserved_by = p_owner_id,
        reserved_order_id = v_order_id,
        reserved_until = v_hold_until,
        updated_at = now()
      where id = v_seating_unit_id
        and status = 'available';

      if not found then
        raise exception 'SEATING_UNIT_UNAVAILABLE'
          using errcode = 'P0001';
      end if;

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

    v_unit_fee := public.all_in_platform_fee_from_public(v_price, v_rate);

    if (v_capacity - v_sold) < v_quantity then
      raise exception 'Sold out'
        using errcode = 'P0001';
    end if;

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

        -- Packs de mesas: descuentan cupo del tier numerado, sin elegir unidad en mapa.

        if (v_child_cap - v_child_sold) < v_child_qty then
          raise exception 'Sold out'
            using errcode = 'P0001';
        end if;

        update public.ticket_tiers
        set sold = sold + v_child_qty
        where id = v_child_id;
      end loop;
    end if;

    update public.ticket_tiers
    set sold = sold + v_quantity
    where id = v_tier_id;

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

revoke all on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid) from public;
grant execute on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;
