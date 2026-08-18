-- =============================================================================
-- P94 - Checkout hibrido: payload general/mapped, cupo de sector logico, 409
-- =============================================================================

create or replace function public.checkout_cart_item_tier_id(p_item jsonb)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_raw text;
begin
  v_raw := nullif(btrim(coalesce(
    p_item ->> 'ticket_tier_id',
    p_item ->> 'tier_id',
    p_item ->> 'ticketTierId',
    p_item ->> 'tierId',
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

create or replace function public.checkout_cart_item_seat_id(p_item jsonb)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_raw text;
begin
  v_raw := nullif(btrim(coalesce(
    p_item ->> 'seating_unit_id',
    p_item ->> 'seat_id',
    p_item ->> 'seatId',
    p_item ->> 'seatingUnitId',
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

create or replace function public.normalize_checkout_cart_items(
  p_event_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_tier_id uuid;
  v_seat_id uuid;
  v_element_id text;
  v_type text;
  v_quantity integer;
  v_resolved uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVENTORY_CONFLICT_409'
      using errcode = 'P0001';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_tier_id := public.checkout_cart_item_tier_id(v_item);
    v_seat_id := public.checkout_cart_item_seat_id(v_item);
    v_element_id := nullif(btrim(coalesce(
      v_item ->> 'element_id',
      v_item ->> 'elementId',
      ''
    )), '');
    v_type := lower(nullif(btrim(coalesce(v_item ->> 'type', '')), ''));
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_type is null then
      v_type := case
        when v_seat_id is not null or v_element_id is not null then 'mapped'
        else 'general'
      end;
    end if;

    if v_type = 'mapped' then
      v_quantity := 1;
      if v_seat_id is null and v_element_id is not null then
        select u.id
          into v_resolved
        from public.event_seating_units as u
        where u.event_id = p_event_id
          and u.layout_item_id = v_element_id
        limit 1;
        if v_resolved is null then
          raise exception 'INVENTORY_CONFLICT_409'
            using errcode = 'P0001';
        end if;
        v_seat_id := v_resolved;
      end if;
      if v_seat_id is null then
        raise exception 'INVENTORY_CONFLICT_409'
          using errcode = 'P0001';
      end if;
    end if;

    if v_tier_id is null or v_quantity <= 0 then
      raise exception 'Cada item requiere ticket_tier_id y quantity > 0'
        using errcode = '22023';
    end if;

    v_out := v_out || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'type', v_type,
          'ticket_tier_id', v_tier_id,
          'tier_id', v_tier_id,
          'quantity', v_quantity,
          'seating_unit_id', v_seat_id,
          'seat_id', v_seat_id,
          'element_id', v_element_id,
          'sector_key', nullif(btrim(coalesce(v_item ->> 'sector_key', '')), ''),
          'table_number', nullif(v_item ->> 'table_number', '')::integer,
          'zone_id', nullif(v_item ->> 'zone_id', '')::uuid,
          'phase_id', nullif(v_item ->> 'phase_id', '')::uuid
        )
      )
    );
  end loop;

  return v_out;
end;
$$;

create or replace function public.assert_logical_sector_stock(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sector text;
  v_slug text;
  v_zone public.event_zones%rowtype;
  v_used integer := 0;
  v_additional integer := greatest(0, coalesce(p_quantity, 0));
begin
  if v_additional <= 0 then
    return;
  end if;

  select nullif(btrim(coalesce(tt.seating_sector_id, '')), '')
    into v_sector
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
    and tt.event_id = p_event_id
  for update of tt;

  if v_sector is null or v_sector not like 'general:%' then
    return;
  end if;

  v_slug := lower(split_part(v_sector, ':', 2));

  select z.*
    into v_zone
  from public.event_zones as z
  where z.event_id = p_event_id
    and z.type = 'general_admission'
    and (
      lower(replace(z.name, ' ', '-')) = v_slug
      or lower(z.name) = replace(v_slug, '-', ' ')
    )
  order by z.id
  for update of z
  limit 1;

  if not found then
    return;
  end if;

  select coalesce(sum(tt.sold), 0)::integer
    into v_used
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.seating_sector_id = v_sector;

  if (v_used + v_additional) > v_zone.capacity then
    raise exception 'INVENTORY_CONFLICT_409'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.apply_ga_stock_for_reserve(
  p_event_id uuid,
  p_owner_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_phase_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_additional integer;
begin
  v_additional := public.consume_ga_cart_hold_for_reserve(
    p_event_id,
    p_owner_id,
    p_tier_id,
    p_quantity
  );

  perform public.assert_cascade_stock_available(
    p_event_id,
    p_tier_id,
    v_additional,
    p_phase_id
  );

  perform public.assert_logical_sector_stock(
    p_event_id,
    p_tier_id,
    v_additional
  );

  if v_additional > 0 then
    update public.ticket_tiers
    set sold = sold + v_additional
    where id = p_tier_id;
  end if;
end;
$$;

create or replace function public.reserve_hybrid_cart_tx(
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
set search_path = pg_catalog, public
as $$
begin
  return query
  select *
  from public.reserve_unified_cart_tx(
    p_event_id,
    p_owner_id,
    public.normalize_checkout_cart_items(p_event_id, p_items),
    p_promoter_id
  );
end;
$$;

comment on function public.normalize_checkout_cart_items(uuid, jsonb) is
  'Normaliza items general/mapped (ticket_tier_id, seat_id, element_id) al contrato de reserve_*.';

comment on function public.assert_logical_sector_stock(uuid, uuid, integer) is
  'FOR UPDATE del event_zone general: y valida sold del sector. 409 si no hay cupo.';

comment on function public.reserve_hybrid_cart_tx(uuid, uuid, jsonb, uuid) is
  'Reserva atomica de carrito hibrido. Normaliza payload y delega en reserve_unified_cart_tx.';

revoke all on function public.checkout_cart_item_tier_id(jsonb) from public, anon;
grant execute on function public.checkout_cart_item_tier_id(jsonb)
  to authenticated, service_role;

revoke all on function public.checkout_cart_item_seat_id(jsonb) from public, anon;
grant execute on function public.checkout_cart_item_seat_id(jsonb)
  to authenticated, service_role;

revoke all on function public.normalize_checkout_cart_items(uuid, jsonb) from public, anon;
grant execute on function public.normalize_checkout_cart_items(uuid, jsonb)
  to authenticated, service_role;

revoke all on function public.assert_logical_sector_stock(uuid, uuid, integer)
  from public, anon;
grant execute on function public.assert_logical_sector_stock(uuid, uuid, integer)
  to authenticated, service_role;

revoke all on function public.apply_ga_stock_for_reserve(uuid, uuid, uuid, integer, uuid)
  from public, anon;
grant execute on function public.apply_ga_stock_for_reserve(uuid, uuid, uuid, integer, uuid)
  to authenticated, service_role;

revoke all on function public.reserve_hybrid_cart_tx(uuid, uuid, jsonb, uuid)
  from public, anon;
grant execute on function public.reserve_hybrid_cart_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;

create or replace function public.hold_ga_tickets_for_cart(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb
)
returns table (reserved_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_tier_id uuid;
  v_qty integer;
  v_prev integer;
  v_delta integer;
  v_tier public.ticket_tiers%rowtype;
  v_until timestamptz := public.checkout_hold_until();
  v_min timestamptz := v_until;
  v_keep uuid[] := '{}';
  v_tier_ids uuid[] := '{}';
  v_held boolean := false;
  v_stale public.event_ga_cart_holds%rowtype;
begin
  perform set_config('lock_timeout', '4s', true);

  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform 1 from public.events as e where e.id = p_event_id for update of e;

  if not public.event_is_buyable(p_event_id) then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_tier_id := public.checkout_cart_item_tier_id(v_item);
    v_qty := greatest(0, coalesce((v_item->>'quantity')::integer, 0));
    if v_tier_id is null or v_qty < 1 then
      continue;
    end if;
    v_tier_ids := array_append(v_tier_ids, v_tier_id);
  end loop;

  select coalesce(array_agg(distinct tid order by tid), '{}'::uuid[])
    into v_tier_ids
  from (
    select unnest(v_tier_ids) as tid
    union
    select h.tier_id
    from public.event_ga_cart_holds as h
    where h.event_id = p_event_id
      and h.owner_id = p_owner_id
  ) as ids;

  if coalesce(array_length(v_tier_ids, 1), 0) > 0 then
    perform tt.id
    from public.ticket_tiers as tt
    where tt.id = any (v_tier_ids)
      and tt.event_id = p_event_id
    order by tt.id
    for update of tt;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_tier_id := public.checkout_cart_item_tier_id(v_item);
    v_qty := greatest(0, coalesce((v_item->>'quantity')::integer, 0));
    if v_tier_id is null or v_qty < 1 then
      continue;
    end if;

    select *
      into v_tier
    from public.ticket_tiers as tt
    where tt.id = v_tier_id
      and tt.event_id = p_event_id;

    if not found then
      raise exception 'Ticket tier no encontrado'
        using errcode = 'P0002';
    end if;

    select coalesce(h.quantity, 0)
      into v_prev
    from public.event_ga_cart_holds as h
    where h.event_id = p_event_id
      and h.owner_id = p_owner_id
      and h.tier_id = v_tier_id;

    v_delta := v_qty - coalesce(v_prev, 0);

    if v_delta > 0 then
      perform public.assert_cascade_stock_available(
        p_event_id,
        v_tier_id,
        v_delta,
        null
      );
      perform public.assert_logical_sector_stock(
        p_event_id,
        v_tier_id,
        v_delta
      );
    end if;

    if v_delta <> 0 then
      update public.ticket_tiers
      set sold = greatest(0, sold + v_delta)
      where id = v_tier_id;
    end if;

    insert into public.event_ga_cart_holds (
      event_id,
      tier_id,
      owner_id,
      quantity,
      reserved_until
    )
    values (
      p_event_id,
      v_tier_id,
      p_owner_id,
      v_qty,
      v_until
    )
    on conflict (event_id, owner_id, tier_id)
    do update set
      quantity = excluded.quantity,
      reserved_until = excluded.reserved_until;

    v_keep := array_append(v_keep, v_tier_id);
    v_held := true;
    if v_until < v_min then
      v_min := v_until;
    end if;
  end loop;

  if not v_held then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  for v_stale in
    select *
    from public.event_ga_cart_holds as h
    where h.event_id = p_event_id
      and h.owner_id = p_owner_id
      and not (h.tier_id = any (v_keep))
    order by h.tier_id
    for update
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_stale.quantity)
    where id = v_stale.tier_id;

    delete from public.event_ga_cart_holds where id = v_stale.id;
  end loop;

  reserved_until := v_min;
  return next;
end;
$$;

revoke all on function public.hold_ga_tickets_for_cart(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.hold_ga_tickets_for_cart(uuid, uuid, jsonb)
  to authenticated, service_role;
