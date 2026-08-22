-- Zonas / Acceso general en un mapa (has_map=true, is_numbered=false)
-- no pueden exigir seat_id. Solo numbered_seat y table_combo reservan unidades.
create or replace function public.hold_mixed_cart_for_checkout(
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
  v_type text;
  v_tier_id uuid;
  v_qty integer;
  v_seat_id uuid;
  v_keep_seats uuid[] := '{}';
  v_ga_items jsonb := '[]'::jsonb;
  v_until timestamptz := public.checkout_hold_until();
  v_min timestamptz := v_until;
  v_tier public.ticket_tiers%rowtype;
  v_map_backed boolean;
  v_item_numbered boolean;
  v_flag text;
  v_ga_until timestamptz;
  v_held boolean := false;
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
    v_seat_id := public.checkout_cart_item_seat_id(v_item);
    v_type := lower(nullif(btrim(coalesce(v_item ->> 'type', '')), ''));
    v_qty := greatest(0, coalesce((v_item ->> 'quantity')::integer, 0));
    v_flag := lower(nullif(btrim(coalesce(
      v_item ->> 'is_numbered',
      v_item ->> 'isNumbered',
      ''
    )), ''));
    v_item_numbered :=
      case
        when v_flag = 'true' then true
        when v_flag = 'false' then false
        else null
      end;

    if v_tier_id is null then
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

    v_map_backed :=
      case
        when v_item_numbered is false then false
        when v_item_numbered is true then true
        else coalesce(v_tier.layout_type, '') in ('numbered_seat', 'table_combo')
      end;

    if v_type = 'mapped' or v_seat_id is not null then
      if v_seat_id is null then
        raise exception 'SEAT_SELECTION_REQUIRED'
          using errcode = 'P0001';
      end if;
      v_keep_seats := array_append(v_keep_seats, v_seat_id);
    elsif v_map_backed then
      raise exception 'SEAT_SELECTION_REQUIRED'
        using errcode = 'P0001';
    else
      if v_qty < 1 then
        continue;
      end if;
      v_ga_items := v_ga_items || jsonb_build_array(
        jsonb_build_object(
          'type', 'general',
          'ticket_tier_id', v_tier_id,
          'tier_id', v_tier_id,
          'quantity', v_qty
        )
      );
    end if;
  end loop;

  if coalesce(array_length(v_keep_seats, 1), 0) > 0 then
    select coalesce(array_agg(distinct seat_id), '{}'::uuid[])
      into v_keep_seats
      from unnest(v_keep_seats) as seat_id;

    update public.event_seating_units
       set status = 'available',
           reserved_by = null,
           reserved_order_id = null,
           reserved_until = null,
           updated_at = now()
     where event_id = p_event_id
       and reserved_by = p_owner_id
       and status = 'reserved'
       and reserved_order_id is null
       and not (id = any (v_keep_seats));

    foreach v_seat_id in array v_keep_seats
    loop
      perform public.hold_seating_unit_for_cart(
        p_event_id,
        p_owner_id,
        v_seat_id
      );
    end loop;

    v_held := true;
  end if;

  if jsonb_array_length(v_ga_items) > 0 then
    begin
      select h.reserved_until
        into v_ga_until
        from public.hold_ga_tickets_for_cart(
          p_event_id,
          p_owner_id,
          v_ga_items
        ) as h;
      if v_ga_until is not null and v_ga_until < v_min then
        v_min := v_ga_until;
      end if;
      v_held := true;
    exception
      when others then
        if sqlerrm ilike '%SEAT_%' or sqlerrm ilike '%SECTOR_%' then
          raise;
        end if;
        raise exception 'GENERAL_STOCK_UNAVAILABLE'
          using errcode = 'P0001';
    end;
  end if;

  if not v_held then
    raise exception 'La cantidad debe ser mayor a cero'
      using errcode = '22023';
  end if;

  reserved_until := v_min;
  return next;
end;
$$;

comment on function public.hold_mixed_cart_for_checkout(uuid, uuid, jsonb) is
  'Hold atómico: asientos/mesas numerados contra event_seating_units; zonas GA y adicionales contra ticket_tiers.';
