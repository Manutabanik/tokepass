-- P181 · Combos multi-día: combo_items por jornada, explosión de QR y holds de mapa.

create table if not exists public.combo_items (
  id uuid primary key default gen_random_uuid(),
  combo_tier_id uuid not null references public.ticket_tiers (id) on delete cascade,
  schedule_id uuid not null references public.event_schedules (id) on delete cascade,
  child_tier_id uuid references public.ticket_tiers (id) on delete set null,
  quantity integer not null default 1
    check (quantity between 1 and 50),
  created_at timestamptz not null default now(),
  unique (combo_tier_id, schedule_id)
);

create index if not exists combo_items_combo_idx
  on public.combo_items (combo_tier_id);

create index if not exists combo_items_schedule_idx
  on public.combo_items (schedule_id);

comment on table public.combo_items is
  'Un ticket_tier Combo compuesto por jornadas (generales o de mapa).';

alter table public.combo_items enable row level security;

drop policy if exists combo_items_select on public.combo_items;
create policy combo_items_select
  on public.combo_items
  for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.ticket_tiers tt
      join public.events e on e.id = tt.event_id
      where tt.id = combo_tier_id
        and (
          e.status = 'published'
          or e.organizer_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'super_admin'
          )
        )
    )
  );

drop policy if exists combo_items_write on public.combo_items;
create policy combo_items_write
  on public.combo_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.ticket_tiers tt
      join public.events e on e.id = tt.event_id
      where tt.id = combo_tier_id
        and (
          e.organizer_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'super_admin'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.ticket_tiers tt
      join public.events e on e.id = tt.event_id
      where tt.id = combo_tier_id
        and (
          e.organizer_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'super_admin'
          )
        )
    )
  );

grant select, insert, update, delete on public.combo_items to authenticated;
grant all on public.combo_items to service_role;

alter table public.tickets
  add column if not exists event_date_id uuid
    references public.event_schedules (id) on delete set null;

alter table public.tickets
  add column if not exists source_combo_tier_id uuid
    references public.ticket_tiers (id) on delete set null;

create index if not exists tickets_event_date_id_idx
  on public.tickets (event_date_id)
  where event_date_id is not null;

create index if not exists tickets_source_combo_tier_idx
  on public.tickets (source_combo_tier_id)
  where source_combo_tier_id is not null;

create or replace function public.tier_is_explodable_combo(p_tier_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.ticket_tiers t
    where t.id = p_tier_id
      and (
        t.ticket_type = 'combo'
        or exists (
          select 1
          from public.combo_items c
          where c.combo_tier_id = t.id
        )
      )
  );
$$;

create or replace function public.combo_parts_for_tier(p_tier_id uuid)
returns table (
  schedule_id uuid,
  child_tier_id uuid,
  quantity integer
)
language plpgsql
stable
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.combo_items where combo_tier_id = p_tier_id
  ) then
    return query
    select c.schedule_id, c.child_tier_id, c.quantity
    from public.combo_items c
    where c.combo_tier_id = p_tier_id
    order by c.created_at, c.schedule_id;
    return;
  end if;

  if exists (
    select 1
    from public.ticket_tiers parent
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(parent.bundle_items, '[]'::jsonb)) = 'array'
          then parent.bundle_items
        else '[]'::jsonb
      end
    ) item
    join public.ticket_tiers child
      on child.id = coalesce(
        nullif(item->>'tier_id', '')::uuid,
        nullif(item->>'tierId', '')::uuid
      )
    where parent.id = p_tier_id
      and child.day_id is not null
  ) then
    return query
    select
      child.day_id,
      child.id,
      greatest(1, coalesce(nullif(item->>'quantity', '')::integer, 1))
    from public.ticket_tiers parent
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(parent.bundle_items, '[]'::jsonb)) = 'array'
          then parent.bundle_items
        else '[]'::jsonb
      end
    ) item
    join public.ticket_tiers child
      on child.id = coalesce(
        nullif(item->>'tier_id', '')::uuid,
        nullif(item->>'tierId', '')::uuid
      )
    where parent.id = p_tier_id
      and child.day_id is not null
    order by child.day_id;
    return;
  end if;

  if exists (
    select 1
    from public.ticket_tiers t
    where t.id = p_tier_id
      and t.ticket_type = 'combo'
  ) then
    return query
    select s.id, null::uuid, 1
    from public.ticket_tiers t
    join public.event_schedules s on s.event_id = t.event_id
    where t.id = p_tier_id
    order by s.start_time, s.id;
  end if;
end;
$$;

create or replace function public.sync_combo_items(
  p_combo_tier_id uuid,
  p_schedule_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_day uuid;
  v_child uuid;
  v_event uuid;
begin
  if p_combo_tier_id is null then
    return 0;
  end if;

  select event_id into v_event
  from public.ticket_tiers
  where id = p_combo_tier_id;

  if v_event is null then
    raise exception 'Ticket tier not found' using errcode = 'P0002';
  end if;

  delete from public.combo_items
  where combo_tier_id = p_combo_tier_id;

  if p_schedule_ids is null then
    return 0;
  end if;

  foreach v_day in array p_schedule_ids loop
    if v_day is null then
      continue;
    end if;
    if not exists (
      select 1
      from public.event_schedules s
      where s.id = v_day
        and s.event_id = v_event
    ) then
      continue;
    end if;

    select t.id
      into v_child
    from public.ticket_tiers t
    where t.event_id = v_event
      and t.day_id = v_day
      and t.id is distinct from p_combo_tier_id
      and t.ticket_type is distinct from 'combo'
    order by
      case when t.seating_sector_id is not null then 0 else 1 end,
      t.created_at
    limit 1;

    insert into public.combo_items (
      combo_tier_id,
      schedule_id,
      child_tier_id,
      quantity
    )
    values (p_combo_tier_id, v_day, v_child, 1);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.sync_combo_items(uuid, uuid[]) from public;
grant execute on function public.sync_combo_items(uuid, uuid[]) to service_role;
grant execute on function public.sync_combo_items(uuid, uuid[]) to authenticated;

create or replace function public.apply_combo_child_stock(
  p_child_tier_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_child_tier_id is null or coalesce(p_quantity, 0) <= 0 then
    return;
  end if;

  update public.ticket_tiers
  set
    sold = sold + p_quantity,
    updated_at = now()
  where id = p_child_tier_id
    and sold + p_quantity <= capacity;

  if not found then
    raise exception 'combo_day_sold_out'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.explode_combo_ticket()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  r record;
  v_first boolean := true;
  v_layout text;
  v_day_unit uuid;
  v_src public.event_seating_units%rowtype;
begin
  if NEW.source_combo_tier_id is not null then
    return NEW;
  end if;
  if not public.tier_is_explodable_combo(NEW.tier_id) then
    return NEW;
  end if;
  if not exists (
    select 1 from public.combo_parts_for_tier(NEW.tier_id)
  ) then
    return NEW;
  end if;

  if NEW.seating_unit_id is not null then
    select * into v_src
    from public.event_seating_units
    where id = NEW.seating_unit_id;
    v_layout := nullif(btrim(coalesce(v_src.layout_item_id, '')), '');
  end if;

  for r in
    select * from public.combo_parts_for_tier(NEW.tier_id)
  loop
    v_day_unit := NEW.seating_unit_id;
    if v_layout is not null then
      select u.id
        into v_day_unit
      from public.event_seating_units u
      where u.event_id = NEW.event_id
        and u.layout_item_id = v_layout
        and u.event_date_id is not distinct from r.schedule_id
      order by u.id
      limit 1;

      if v_day_unit is null then
        raise exception 'combo_day_unit_missing'
          using errcode = 'P0002';
      end if;

      if v_day_unit is distinct from NEW.seating_unit_id then
        update public.event_seating_units
        set
          status = v_src.status,
          reserved_by = v_src.reserved_by,
          reserved_until = v_src.reserved_until,
          reserved_order_id = coalesce(v_src.reserved_order_id, NEW.order_id),
          sold_order_id = v_src.sold_order_id,
          updated_at = now()
        where id = v_day_unit
          and status in ('available', 'reserved');

        if not found then
          raise exception 'combo_day_sold_out'
            using errcode = 'P0001';
        end if;
      end if;
    end if;

    if v_first then
      update public.tickets
      set
        event_date_id = r.schedule_id,
        source_combo_tier_id = NEW.tier_id,
        seating_unit_id = v_day_unit,
        tier_id = coalesce(r.child_tier_id, NEW.tier_id)
      where id = NEW.id;
      if r.child_tier_id is not null and r.child_tier_id is distinct from NEW.tier_id then
        perform public.apply_combo_child_stock(r.child_tier_id, greatest(1, r.quantity));
      end if;
      v_first := false;
    else
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
        phase_id,
        seat_id,
        seating_unit_id,
        event_date_id,
        source_combo_tier_id,
        holder_name,
        holder_dni,
        holder_email,
        ticket_type,
        is_test
      )
      values (
        NEW.event_id,
        coalesce(r.child_tier_id, NEW.tier_id),
        NEW.owner_id,
        gen_random_uuid()::text,
        encode(extensions.gen_random_bytes(24), 'hex'),
        NEW.status,
        NEW.order_id,
        NEW.group_id,
        NEW.group_slot,
        NEW.max_admissions,
        0,
        NEW.phase_id,
        NEW.seat_id,
        v_day_unit,
        r.schedule_id,
        NEW.tier_id,
        NEW.holder_name,
        NEW.holder_dni,
        NEW.holder_email,
        NEW.ticket_type,
        NEW.is_test
      );
      if r.child_tier_id is not null and r.child_tier_id is distinct from NEW.tier_id then
        perform public.apply_combo_child_stock(r.child_tier_id, greatest(1, r.quantity));
      end if;
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists tickets_explode_combo_ai on public.tickets;
create trigger tickets_explode_combo_ai
  after insert on public.tickets
  for each row
  execute function public.explode_combo_ticket();

create or replace function public.hold_seat_for_combo(
  p_seat_id text,
  p_combo_tier_id uuid,
  p_session_id text,
  p_event_id uuid default null
)
returns table (
  hold_id uuid,
  seating_unit_id uuid,
  event_id uuid,
  expires_at timestamptz,
  event_date_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  v_row record;
  v_any boolean := false;
begin
  for r in
    select p.schedule_id
    from public.combo_parts_for_tier(p_combo_tier_id) p
  loop
    v_any := true;
    select * into v_row
    from public.hold_seat(p_seat_id, r.schedule_id, p_session_id);
    hold_id := v_row.hold_id;
    seating_unit_id := v_row.seating_unit_id;
    event_id := v_row.event_id;
    expires_at := v_row.expires_at;
    event_date_id := r.schedule_id;
    return next;
  end loop;

  if not v_any then
    select * into v_row
    from public.hold_seat(p_seat_id, null, p_session_id);
    hold_id := v_row.hold_id;
    seating_unit_id := v_row.seating_unit_id;
    event_id := v_row.event_id;
    expires_at := v_row.expires_at;
    event_date_id := null;
    return next;
  end if;
end;
$$;

revoke all on function public.hold_seat_for_combo(text, uuid, text, uuid) from public;
grant execute on function public.hold_seat_for_combo(text, uuid, text, uuid)
  to service_role, authenticated;

create or replace function public.hold_layout_item_for_combo(
  p_event_id uuid,
  p_owner_id uuid,
  p_sector_id text,
  p_layout_item_id text,
  p_combo_tier_id uuid
)
returns table (
  seating_unit_id uuid,
  reserved_until timestamptz,
  event_date_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  v_row record;
  v_any boolean := false;
begin
  for r in
    select p.schedule_id
    from public.combo_parts_for_tier(p_combo_tier_id) p
  loop
    v_any := true;
    select * into v_row
    from public.hold_seating_unit_for_cart_by_layout(
      p_event_id,
      p_owner_id,
      p_sector_id,
      p_layout_item_id,
      r.schedule_id
    );
    seating_unit_id := v_row.seating_unit_id;
    reserved_until := v_row.reserved_until;
    event_date_id := r.schedule_id;
    return next;
  end loop;

  if not v_any then
    raise exception 'combo_days_missing' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.hold_layout_item_for_combo(uuid, uuid, text, text, uuid) from public;
grant execute on function public.hold_layout_item_for_combo(uuid, uuid, text, text, uuid)
  to service_role, authenticated;
