-- P161: event_seating_units por jornada (optimistic hold multidía).
-- event_date_id = event_schedules.id. Las reservas temporales viven en
-- event_seating_units.reserved_by / reserved_until (no hay tabla seat_holds).

alter table public.event_seating_units
  add column if not exists event_date_id uuid
    references public.event_schedules (id) on delete set null;

comment on column public.event_seating_units.event_date_id is
  'Jornada (event_schedules.id). Alias de producto: event_date_id / dateId.';

update public.event_seating_units as u
set event_date_id = t.day_id
from public.ticket_tiers as t
where u.tier_id = t.id
  and u.event_date_id is null
  and t.day_id is not null
  and exists (
    select 1
    from public.event_schedules as s
    where s.id = t.day_id
  );

create index if not exists event_seating_units_event_day_layout_idx
  on public.event_seating_units (event_id, event_date_id, layout_item_id);

create or replace function public.stamp_event_seating_unit_event_date_id()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.event_date_id is null and new.tier_id is not null then
    select t.day_id
      into new.event_date_id
    from public.ticket_tiers as t
    where t.id = new.tier_id;
  end if;
  return new;
end;
$$;

drop trigger if exists event_seating_units_stamp_event_date_id
  on public.event_seating_units;
create trigger event_seating_units_stamp_event_date_id
before insert or update of tier_id, event_date_id
on public.event_seating_units
for each row
execute function public.stamp_event_seating_unit_event_date_id();

create or replace function public.sync_seating_units_event_date_from_tier()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  update public.event_seating_units as u
  set
    event_date_id = new.day_id,
    updated_at = now()
  where u.tier_id = new.id
    and u.event_date_id is distinct from new.day_id;
  return new;
end;
$$;

drop trigger if exists ticket_tiers_sync_seating_unit_event_date
  on public.ticket_tiers;
create trigger ticket_tiers_sync_seating_unit_event_date
after insert or update of day_id
on public.ticket_tiers
for each row
execute function public.sync_seating_units_event_date_from_tier();

drop function if exists public.hold_seating_unit_for_cart_by_layout(uuid, uuid, text, text);

create or replace function public.hold_seating_unit_for_cart_by_layout(
  p_event_id uuid,
  p_owner_id uuid,
  p_sector_id text,
  p_layout_item_id text,
  p_event_date_id uuid default null
)
returns table (seating_unit_id uuid, reserved_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unit_id uuid;
  v_day_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_sector_id is null or btrim(p_sector_id) = ''
     or p_layout_item_id is null or btrim(p_layout_item_id) = '' then
    raise exception 'SEATING_UNIT_NOT_MATERIALIZED' using errcode = 'P0002';
  end if;

  if p_event_date_id is null then
    select count(distinct coalesce(u.event_date_id, t.day_id))
      into v_day_count
    from public.event_seating_units as u
    left join public.ticket_tiers as t on t.id = u.tier_id
    where u.event_id = p_event_id
      and u.sector_id = p_sector_id
      and u.layout_item_id = p_layout_item_id
      and coalesce(u.event_date_id, t.day_id) is not null;

    if coalesce(v_day_count, 0) > 1 then
      raise exception 'missing_event_date_id' using errcode = 'P0001';
    end if;
  end if;

  select u.id
    into v_unit_id
  from public.event_seating_units as u
  left join public.ticket_tiers as t on t.id = u.tier_id
  where u.event_id = p_event_id
    and u.sector_id = p_sector_id
    and u.layout_item_id = p_layout_item_id
    and (
      p_event_date_id is null
      or coalesce(u.event_date_id, t.day_id) is null
      or coalesce(u.event_date_id, t.day_id) = p_event_date_id
    )
  order by
    case when u.status in ('available', 'reserved') then 0 else 1 end,
    u.id
  limit 1;

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

revoke all on function public.hold_seating_unit_for_cart_by_layout(uuid, uuid, text, text, uuid)
  from public;
grant execute on function public.hold_seating_unit_for_cart_by_layout(uuid, uuid, text, text, uuid)
  to authenticated, service_role;

comment on function public.hold_seating_unit_for_cart_by_layout(uuid, uuid, text, text, uuid) is
  'Resuelve layout_item_id + jornada (event_date_id) a event_seating_units.id y aplica el hold de carrito.';
