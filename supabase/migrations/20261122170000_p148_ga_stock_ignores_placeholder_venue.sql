-- GA / adicionales no pueden agotarse por venues.max_capacity = 1 ni por el aforo del mapa.
-- Stock de layout general = ticket_tiers.capacity - sold.
create or replace function public.get_event_tier_live_stock(p_event_id uuid)
returns table (
  tier_id uuid,
  capacity integer,
  sold integer,
  available integer,
  venue_remaining integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_venue_id uuid;
  v_venue_cap integer := null;
  v_has_seating_plan boolean := false;
begin
  if not public.event_uses_live_stock(p_event_id) then
    return query
    select
      tt.id,
      coalesce(tt.total_capacity, tt.capacity)::integer,
      0::integer,
      coalesce(tt.total_capacity, tt.capacity)::integer,
      coalesce(tt.total_capacity, tt.capacity)::integer
    from public.ticket_tiers as tt
    where tt.event_id = p_event_id;
    return;
  end if;

  select
    e.venue_id,
    coalesce(e.has_seating_plan, false)
    into v_venue_id, v_has_seating_plan
  from public.events as e
  where e.id = p_event_id;

  -- El default venues.max_capacity = 1 no puede agotar GA. Las tarifas
  -- general/addon usan capacity - sold aunque el evento tenga mapa.
  if v_venue_id is not null then
    select coalesce(v.max_capacity, v.capacity)
      into v_venue_cap
    from public.venues as v
    where v.id = v_venue_id;

    if coalesce(v_venue_cap, 0) <= 1 then
      v_venue_cap := null;
    end if;
  end if;

  return query
  with sku as (
    select
      tt.id,
      tt.day_id,
      tt.tier_type,
      tt.layout_type,
      coalesce(tt.total_capacity, tt.capacity)::integer as capacity,
      greatest(
        0,
        tt.sold - coalesce(expired.qty, 0)
      )::integer as sold
    from public.ticket_tiers as tt
    left join lateral (
      select coalesce(sum(h.quantity), 0)::integer as qty
      from public.event_ga_cart_holds as h
      where h.tier_id = tt.id
        and h.reserved_until <= clock_timestamp()
    ) as expired on true
    where tt.event_id = p_event_id
  )
  select
    sku.id,
    sku.capacity,
    sku.sold,
    greatest(
      0,
      least(
        sku.capacity - sku.sold,
        case
          when v_venue_cap is null then sku.capacity - sku.sold
          when sku.tier_type = 'addon' then sku.capacity - sku.sold
          when coalesce(sku.layout_type, 'general') not in ('numbered_seat', 'table_combo') then sku.capacity - sku.sold
          when public.ticket_day_is_full_pass(sku.day_id) then
            coalesce(
              (
                select min(
                  greatest(
                    0,
                    v_venue_cap
                      - public.event_occupied_day_units(p_event_id, d.day_id)
                  )
                )
                from public.event_schedule_day_ids(p_event_id) as d
              ),
              greatest(
                0,
                v_venue_cap - public.event_occupied_venue_units(p_event_id)
              )
            )
          else
            greatest(
              0,
              v_venue_cap
                - public.event_occupied_day_units(
                    p_event_id,
                    sku.day_id::text
                  )
            )
        end
      )
    )::integer as available,
    case
      when v_venue_cap is null then null
      when sku.tier_type = 'addon' then null
      when coalesce(sku.layout_type, 'general') not in ('numbered_seat', 'table_combo') then null
      when public.ticket_day_is_full_pass(sku.day_id) then
        coalesce(
          (
            select min(
              greatest(
                0,
                v_venue_cap
                  - public.event_occupied_day_units(p_event_id, d.day_id)
              )
            )
            from public.event_schedule_day_ids(p_event_id) as d
          ),
          greatest(
            0,
            v_venue_cap - public.event_occupied_venue_units(p_event_id)
          )
        )
      else
        greatest(
          0,
          v_venue_cap
            - public.event_occupied_day_units(p_event_id, sku.day_id::text)
        )
    end::integer as venue_remaining
  from sku;
end;
$$;

revoke all on function public.get_event_tier_live_stock(uuid) from public;
grant execute on function public.get_event_tier_live_stock(uuid)
  to anon, authenticated, service_role;

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
  v_sandbox boolean := false;
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

  v_sandbox := public.is_sandbox_event_status(v_event.status);

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

  if v_sandbox then
    v_tier.sold := 0;
    v_event.venue_id := null;
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

  if v_sandbox then
    v_expired := 0;
  end if;

  if v_event.venue_id is not null
     and v_tier.tier_type is distinct from 'addon'
     and coalesce(v_tier.layout_type, '') in ('numbered_seat', 'table_combo') then
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

    if coalesce(v_venue_cap, 0) <= 1 then
      v_venue_left := null;
    elsif public.ticket_day_is_full_pass(v_tier.day_id) then
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
  if not v_sandbox
     and (v_tier_cap - v_tier.sold + v_expired) < v_additional then
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

    if v_sandbox then
      v_phase.sold := 0;
    end if;

    if v_phase.status = 'sold_out' and not v_sandbox then
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
      if not v_sandbox and v_additional > v_phase_left then
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
  'Valida stock en cascada. En sandbox no agota aforo publicado. Recinto: table_combo = qty * capacity_per_unit.';

revoke all on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) from public;
revoke all on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid) from anon;
grant execute on function public.assert_cascade_stock_available(uuid, uuid, integer, uuid)
  to authenticated, service_role;

