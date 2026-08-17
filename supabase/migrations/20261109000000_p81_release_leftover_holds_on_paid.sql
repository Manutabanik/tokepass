-- P81: after a paid order, drop leftover cart holds for that buyer/event
-- so unused GA/seating reservations do not keep stock locked.

create or replace function public.release_leftover_cart_holds_for_order(
  p_order_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_buyer uuid;
  v_event uuid;
  v_count integer := 0;
  v_unit public.event_seating_units%rowtype;
  v_released integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return 0;
  end if;

  select o.buyer_id
    into v_buyer
  from public.orders as o
  where o.id = p_order_id;

  if v_buyer is null then
    return 0;
  end if;

  for v_event in
    select distinct t.event_id
    from public.tickets as t
    where t.order_id = p_order_id
      and t.event_id is not null
  loop
    select public.release_ga_cart_holds(v_event, v_buyer)
      into v_released;
    v_count := v_count + coalesce(v_released, 0);

    for v_unit in
      select u.*
      from public.event_seating_units as u
      where u.event_id = v_event
        and u.reserved_by = v_buyer
        and u.status = 'reserved'
        and u.reserved_order_id is null
      for update of u
    loop
      if public.release_seating_unit_cart_hold(
        v_event,
        v_buyer,
        v_unit.id
      ) then
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

comment on function public.release_leftover_cart_holds_for_order(uuid) is
  'Libera holds de carrito GA/asientos que no quedaron en la orden pagada.';

revoke all on function public.release_leftover_cart_holds_for_order(uuid) from public;
revoke all on function public.release_leftover_cart_holds_for_order(uuid)
  from anon, authenticated;
grant execute on function public.release_leftover_cart_holds_for_order(uuid)
  to service_role;
