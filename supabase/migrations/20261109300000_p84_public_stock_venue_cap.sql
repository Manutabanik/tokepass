-- P84: el catalogo publico nunca anuncia mas stock que el aforo del recinto
-- por jornada. available = min(sku restante, venue.max_capacity - ocupado_dia).
-- DROP: P83 devolvia (tier_id, capacity, sold, available). CREATE OR REPLACE
-- no puede agregar venue_remaining al tipo de fila.

drop function if exists public.get_event_tier_live_stock(uuid);

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
begin
  perform public.purge_expired_checkout_holds(p_event_id);

  select e.venue_id
    into v_venue_id
  from public.events as e
  where e.id = p_event_id;

  if v_venue_id is not null then
    select coalesce(v.max_capacity, v.capacity)
      into v_venue_cap
    from public.venues as v
    where v.id = v_venue_id;
  end if;

  return query
  with sku as (
    select
      tt.id,
      tt.day_id,
      tt.tier_type,
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

comment on function public.get_event_tier_live_stock(uuid) is
  'Stock en vivo: purge + techo de recinto por jornada. available nunca supera venue.max_capacity - ocupado.';
