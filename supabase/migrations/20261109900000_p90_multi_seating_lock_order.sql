-- P90: N mesas en unified cart, aforo por personas en table_combo, locks ORDER BY id.

-- -----------------------------------------------------------------------------
-- 1) Personas que ocupa un SKU en el recinto (P87: 1 mesa = 1 sold, N sillas)
-- -----------------------------------------------------------------------------
create or replace function public.ticket_tier_venue_people(
  p_sold integer,
  p_layout_type text,
  p_capacity_per_unit integer
)
returns integer
language sql
immutable
as $$
  select greatest(0, coalesce(p_sold, 0))
    * case
        when coalesce(p_layout_type, '') = 'table_combo'
          then greatest(1, coalesce(p_capacity_per_unit, 1))
        else 1
      end;
$$;

comment on function public.ticket_tier_venue_people(integer, text, integer) is
  'Aforo fisico: table_combo cuenta sold * capacity_per_unit (personas). El resto cuenta sold.';

revoke all on function public.ticket_tier_venue_people(integer, text, integer) from public;
grant execute on function public.ticket_tier_venue_people(integer, text, integer)
  to authenticated, service_role;

create or replace function public.event_occupied_day_units(
  p_event_id uuid,
  p_day_id text
)
returns integer
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select greatest(
    0,
    coalesce(
      sum(
        public.ticket_tier_venue_people(
          tt.sold,
          tt.layout_type,
          tt.capacity_per_unit
        )
      ),
      0
    )::integer
      - coalesce((
          select sum(
            public.ticket_tier_venue_people(
              h.quantity,
              ht.layout_type,
              ht.capacity_per_unit
            )
          )::integer
          from public.event_ga_cart_holds as h
          join public.ticket_tiers as ht on ht.id = h.tier_id
          where ht.event_id = p_event_id
            and h.reserved_until <= clock_timestamp()
            and ht.tier_type is distinct from 'addon'
            and ht.tier_type is distinct from 'bundle'
            and (
              public.ticket_day_is_full_pass(ht.day_id)
              or (
                not public.ticket_day_is_full_pass(p_day_id)
                and ht.day_id::text is not distinct from p_day_id
              )
            )
        ), 0)
  )::integer
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.tier_type is distinct from 'addon'
    and tt.tier_type is distinct from 'bundle'
    and (
      public.ticket_day_is_full_pass(tt.day_id)
      or (
        not public.ticket_day_is_full_pass(p_day_id)
        and tt.day_id::text is not distinct from p_day_id
      )
    );
$$;

create or replace function public.event_occupied_venue_units(p_event_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_peak integer := 0;
  v_day text;
  v_has_day boolean := false;
begin
  for v_day in
    select d.day_id from public.event_schedule_day_ids(p_event_id) as d
  loop
    v_has_day := true;
    v_peak := greatest(v_peak, public.event_occupied_day_units(p_event_id, v_day));
  end loop;

  if v_has_day then
    return v_peak;
  end if;

  return (
    select greatest(
      0,
      coalesce(
        sum(
          public.ticket_tier_venue_people(
            tt.sold,
            tt.layout_type,
            tt.capacity_per_unit
          )
        ),
        0
      )::integer
        - coalesce((
            select sum(
              public.ticket_tier_venue_people(
                h.quantity,
                ht.layout_type,
                ht.capacity_per_unit
              )
            )::integer
            from public.event_ga_cart_holds as h
            join public.ticket_tiers as ht on ht.id = h.tier_id
            where h.event_id = p_event_id
              and h.reserved_until <= clock_timestamp()
              and ht.tier_type is distinct from 'addon'
              and ht.tier_type is distinct from 'bundle'
          ), 0)
    )::integer
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id
      and tt.tier_type is distinct from 'addon'
      and tt.tier_type is distinct from 'bundle'
  );
end;
$$;

comment on function public.event_occupied_day_units(uuid, text) is
  'Personas ocupando el recinto en una jornada. table_combo = sold * capacity_per_unit.';

-- -----------------------------------------------------------------------------
-- 2) hold_ga: events mutex, then ticket_tiers ORDER BY id
-- -----------------------------------------------------------------------------
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
    v_tier_id := nullif(v_item->>'tier_id', '')::uuid;
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
    v_tier_id := nullif(v_item->>'tier_id', '')::uuid;
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

-- -----------------------------------------------------------------------------
-- 3) reserve_unified_cart_tx: N seating units, ordered locks, strict bundles
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
  v_tier_ids uuid[] := '{}';
  v_seating_ids uuid[] := '{}';
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

  perform public.expire_buyer_pending_event_orders(p_owner_id, p_event_id);

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_tier_id := (v_item ->> 'tier_id')::uuid;
    exception
      when others then
        raise exception 'tier_id inválido' using errcode = '22P02';
    end;
    if v_tier_id is not null then
      v_tier_ids := array_append(v_tier_ids, v_tier_id);
    end if;
    begin
      v_seating_unit_id := nullif(v_item ->> 'seating_unit_id', '')::uuid;
    exception
      when others then
        v_seating_unit_id := null;
    end;
    if v_seating_unit_id is not null then
      v_seating_ids := array_append(v_seating_ids, v_seating_unit_id);
    end if;
  end loop;

  for v_child in
    select c.value
    from public.ticket_tiers as tt
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(tt.bundle_items) = 'array' then tt.bundle_items
        else '[]'::jsonb
      end
    ) as c(value)
    where tt.id = any (v_tier_ids)
      and coalesce(tt.tier_type, '') = 'bundle'
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
    if v_child_id is null then
      raise exception 'BUNDLE_CHILD_UNAVAILABLE'
        using errcode = 'P0001';
    end if;
    v_tier_ids := array_append(v_tier_ids, v_child_id);
  end loop;

  select coalesce(array_agg(distinct tid order by tid), '{}'::uuid[])
    into v_tier_ids
  from unnest(v_tier_ids) as tid;

  select coalesce(array_agg(distinct sid order by sid), '{}'::uuid[])
    into v_seating_ids
  from unnest(v_seating_ids) as sid;

  if exists (
    select 1
    from (
      select nullif(btrim(value ->> 'seating_unit_id'), '') as raw_id
      from jsonb_array_elements(p_items)
    ) as raw
    where raw.raw_id is not null
    group by raw.raw_id
    having count(*) > 1
  ) then
    raise exception 'SEATING_UNIT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  if coalesce(array_length(v_tier_ids, 1), 0) > 0 then
    perform tt.id
    from public.ticket_tiers as tt
    where tt.id = any (v_tier_ids)
    order by tt.id
    for update of tt;
  end if;

  if coalesce(array_length(v_seating_ids, 1), 0) > 0 then
    perform u.id
    from public.event_seating_units as u
    where u.id = any (v_seating_ids)
      and u.event_id = p_event_id
    order by u.id
    for update of u;
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
    where tt.id = v_tier_id;

    if not found then
      raise exception 'Ticket tier not found'
        using errcode = 'P0002';
    end if;

    if v_tier_event_id is distinct from p_event_id then
      raise exception 'El tier no pertenece al evento'
        using errcode = '23514';
    end if;

    if v_seating_unit_id is not null then
      if v_quantity <> 1 then
        raise exception 'Cada ubicación numerada requiere quantity = 1'
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
          raise exception 'BUNDLE_CHILD_UNAVAILABLE'
            using errcode = 'P0001';
        end if;

        select
          tt.event_id,
          coalesce(tt.tier_type, 'general'),
          tt.layout_type,
          tt.capacity,
          tt.sold
          into v_child_event, v_child_type, v_child_layout, v_child_cap, v_child_sold
        from public.ticket_tiers as tt
        where tt.id = v_child_id;

        if not found or v_child_event is distinct from p_event_id then
          raise exception 'BUNDLE_CHILD_UNAVAILABLE'
            using errcode = 'P0001';
        end if;

        if v_child_type = 'seated' or v_child_layout in ('numbered_seat', 'table_combo') then
          raise exception 'Los combos no reservan asientos numerados automáticamente'
            using errcode = '23514';
        end if;

        if (coalesce(v_child_cap, 0) - coalesce(v_child_sold, 0)) < v_child_qty then
          raise exception 'BUNDLE_CHILD_UNAVAILABLE'
            using errcode = 'P0001';
        end if;

        begin
          perform public.assert_cascade_stock_available(
            p_event_id,
            v_child_id,
            v_child_qty,
            null
          );
        exception
          when others then
            raise exception 'BUNDLE_CHILD_UNAVAILABLE'
              using errcode = 'P0001';
        end;

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

comment on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid) is
  'Reserva atómica de carrito mixto. N mesas + GA + addons. Locks events, tiers ORDER BY id, seating ORDER BY id.';

revoke all on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid) from public;
grant execute on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;

revoke all on function public.hold_ga_tickets_for_cart(uuid, uuid, jsonb) from public, anon;
grant execute on function public.hold_ga_tickets_for_cart(uuid, uuid, jsonb)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) assert_cascade: aforo del recinto en personas (table_combo * capacity_per_unit)
-- -----------------------------------------------------------------------------
create or replace function public.assert_cascade_stock_available(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_phase_id uuid default null
)
returns table (
  venue_id uuid,
  phase_id uuid,
  unit_price numeric,
  venue_remaining integer,
  tier_remaining integer,
  phase_remaining integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.events%rowtype;
  v_tier public.ticket_tiers%rowtype;
  v_venue public.venues%rowtype;
  v_phase public.ticket_tier_phases%rowtype;
  v_now timestamptz := clock_timestamp();
  v_tier_cap integer;
  v_phase_left integer;
  v_venue_left integer;
  v_venue_cap integer;
  v_additional integer := greatest(0, coalesce(p_quantity, 0));
  v_people_additional integer;
  v_day text;
  v_used integer;
  v_has_day boolean := false;
  v_expired integer := 0;
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'La cantidad debe ser mayor o igual a cero'
      using errcode = '22023';
  end if;

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'Evento no encontrado'
      using errcode = 'P0002';
  end if;

  perform public.purge_expired_checkout_holds(p_event_id);

  select *
    into v_tier
  from public.ticket_tiers as tt
  where tt.id = p_tier_id
  for update of tt;

  if not found or v_tier.event_id is distinct from p_event_id then
    raise exception 'Ticket tier no encontrado'
      using errcode = 'P0002';
  end if;

  v_people_additional := public.ticket_tier_venue_people(
    v_additional,
    v_tier.layout_type,
    v_tier.capacity_per_unit
  );

  select coalesce(sum(h.quantity), 0)::integer
    into v_expired
  from public.event_ga_cart_holds as h
  where h.tier_id = p_tier_id
    and h.reserved_until <= clock_timestamp();

  if v_event.venue_id is not null and v_tier.tier_type is distinct from 'addon' then
    select *
      into v_venue
    from public.venues as v
    where v.id = v_event.venue_id
    for update of v;

    if not found then
      raise exception 'Lugar del evento no encontrado'
        using errcode = 'P0002';
    end if;

    v_venue_cap := coalesce(v_venue.max_capacity, v_venue.capacity);
    v_venue_left := greatest(0, v_venue_cap);

    if public.ticket_day_is_full_pass(v_tier.day_id) then
      for v_day in
        select d.day_id from public.event_schedule_day_ids(p_event_id) as d
      loop
        v_has_day := true;
        v_used := public.event_occupied_day_units(p_event_id, v_day);
        v_venue_left := least(v_venue_left, greatest(0, v_venue_cap - v_used));
        if v_people_additional > greatest(0, v_venue_cap - v_used) then
          raise exception 'Capacidad física del recinto insuficiente'
            using errcode = 'P0001';
        end if;
      end loop;

      if not v_has_day then
        v_used := public.event_occupied_venue_units(p_event_id);
        v_venue_left := greatest(0, v_venue_cap - v_used);
        if v_people_additional > v_venue_left then
          raise exception 'Capacidad física del recinto insuficiente'
            using errcode = 'P0001';
        end if;
      end if;
    else
      v_used := public.event_occupied_day_units(p_event_id, v_tier.day_id::text);
      v_venue_left := greatest(0, v_venue_cap - v_used);
      if v_people_additional > v_venue_left then
        raise exception 'Capacidad física del recinto insuficiente'
          using errcode = 'P0001';
      end if;
    end if;
  else
    v_venue_left := null;
  end if;

  v_tier_cap := coalesce(v_tier.total_capacity, v_tier.capacity);
  if (v_tier_cap - v_tier.sold + v_expired) < v_additional then
    raise exception 'Capacidad del ticket insuficiente'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.ticket_tier_phases as p where p.tier_id = p_tier_id
  ) then
    if p_phase_id is not null then
      select *
        into v_phase
      from public.ticket_tier_phases as p
      where p.id = p_phase_id
        and p.tier_id = p_tier_id
      for update of p;

      if not found then
        raise exception 'Fase de venta no encontrada'
          using errcode = 'P0002';
      end if;
    else
      select *
        into v_phase
      from public.ticket_tier_phases as p
      where p.id = (
        select inner_p.id
        from public.ticket_tier_phases as inner_p
        where inner_p.tier_id = p_tier_id
          and inner_p.status = 'active'
        order by inner_p.start_time nulls last
        limit 1
      )
      for update of p;

      if not found then
        select *
          into v_phase
        from public.ticket_tier_phases as p
        where p.id = (
          select inner_p.id
          from public.ticket_tier_phases as inner_p
          where inner_p.tier_id = p_tier_id
            and inner_p.status = 'scheduled'
            and (inner_p.start_time is null or inner_p.start_time <= v_now)
            and (inner_p.end_time is null or inner_p.end_time > v_now)
          order by inner_p.start_time nulls last
          limit 1
        )
        for update of p;
      end if;

      if not found then
        raise exception 'No hay una fase de venta activa para este ticket'
          using errcode = 'P0002';
      end if;
    end if;

    if v_phase.status = 'sold_out' then
      raise exception 'La fase de venta está agotada'
        using errcode = 'P0001';
    end if;

    if v_phase.start_time is not null and v_phase.start_time > v_now then
      raise exception 'La fase de venta todavía no comenzó'
        using errcode = 'P0001';
    end if;

    if v_phase.end_time is not null and v_phase.end_time <= v_now then
      raise exception 'La fase de venta ya cerró'
        using errcode = 'P0001';
    end if;

    if v_phase.capacity_limit is not null then
      v_phase_left := v_phase.capacity_limit - v_phase.sold;
      if v_additional > v_phase_left then
        raise exception 'Capacidad de la fase de venta insuficiente'
          using errcode = 'P0001';
      end if;
    else
      v_phase_left := v_tier_cap - v_tier.sold + v_expired;
    end if;
  else
    v_phase_left := v_tier_cap - v_tier.sold + v_expired;
  end if;

  venue_id := v_event.venue_id;
  phase_id := v_phase.id;
  unit_price := coalesce(v_phase.price, v_tier.price);
  venue_remaining := v_venue_left;
  tier_remaining := v_tier_cap - v_tier.sold + v_expired;
  phase_remaining := v_phase_left;
  return next;
end;
$$;

comment on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) is
  'Valida stock en cascada. El aforo del recinto descuenta personas: table_combo = qty * capacity_per_unit.';

revoke all on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) from public;
revoke all on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) from anon;
grant execute on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid)
  to authenticated, service_role;
