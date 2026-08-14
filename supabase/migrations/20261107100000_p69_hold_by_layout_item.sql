-- P69: Atomic cart hold by algorithmic layout_item_id (parametric tables).
-- Does not treat the generated Mesa ID as a seating_unit UUID.

create or replace function public.hold_seating_unit_for_cart_by_layout(
  p_event_id uuid,
  p_owner_id uuid,
  p_sector_id text,
  p_layout_item_id text
)
returns table (seating_unit_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_sector_id is null or btrim(p_sector_id) = ''
     or p_layout_item_id is null or btrim(p_layout_item_id) = '' then
    raise exception 'SEATING_UNIT_NOT_MATERIALIZED' using errcode = 'P0002';
  end if;

  select u.id
    into v_unit_id
  from public.event_seating_units as u
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and u.layout_item_id = p_layout_item_id;

  if v_unit_id is null then
    raise exception 'SEATING_UNIT_NOT_MATERIALIZED' using errcode = 'P0002';
  end if;

  return query
  select *
  from public.hold_seating_unit_for_cart(
    p_event_id,
    p_owner_id,
    v_unit_id
  );
end;
$$;

revoke all on function public.hold_seating_unit_for_cart_by_layout(uuid, uuid, text, text) from public;
grant execute on function public.hold_seating_unit_for_cart_by_layout(uuid, uuid, text, text)
  to authenticated, service_role;

comment on function public.hold_seating_unit_for_cart_by_layout(uuid, uuid, text, text) is
  'Resuelve layout_item_id paramétrico a event_seating_units.id y aplica el hold de carrito en la misma transacción.';
