-- P85: audit trail comercial, self-heal de fases, RLS de ticket_tier_phases.

-- -----------------------------------------------------------------------------
-- 1) event_sku_changelog (inmutable)
-- -----------------------------------------------------------------------------
create table if not exists public.event_sku_changelog (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tier_id uuid,
  phase_id uuid,
  changed_by uuid,
  field_changed text not null check (length(btrim(field_changed)) >= 1),
  old_value text,
  new_value text,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists event_sku_changelog_event_idx
  on public.event_sku_changelog (event_id, created_at desc);

create index if not exists event_sku_changelog_tier_idx
  on public.event_sku_changelog (tier_id, created_at desc)
  where tier_id is not null;

comment on table public.event_sku_changelog is
  'Historial inmutable de precio, capacidad y jornada de SKUs / fases.';

alter table public.event_sku_changelog enable row level security;

revoke all on table public.event_sku_changelog from public, anon;
grant select on table public.event_sku_changelog to authenticated;
grant all on table public.event_sku_changelog to service_role;

drop policy if exists event_sku_changelog_select on public.event_sku_changelog;
create policy event_sku_changelog_select
  on public.event_sku_changelog
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.events as e
      where e.id = event_sku_changelog.event_id
        and (
          e.organizer_id = (select auth.uid())
          or exists (
            select 1 from public.profiles as p
            where p.id = (select auth.uid()) and p.role = 'super_admin'
          )
        )
    )
  );

create or replace function public.write_event_sku_changelog(
  p_event_id uuid,
  p_tier_id uuid,
  p_phase_id uuid,
  p_field text,
  p_old text,
  p_new text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_event_id is null or p_old is not distinct from p_new then
    return;
  end if;

  insert into public.event_sku_changelog (
    event_id,
    tier_id,
    phase_id,
    changed_by,
    field_changed,
    old_value,
    new_value
  )
  values (
    p_event_id,
    p_tier_id,
    p_phase_id,
    auth.uid(),
    p_field,
    p_old,
    p_new
  );
end;
$$;

create or replace function public.audit_ticket_tiers_sku()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event uuid;
  v_tier uuid;
begin
  if tg_op = 'DELETE' then
    v_event := old.event_id;
    v_tier := old.id;
    perform public.write_event_sku_changelog(
      v_event, v_tier, null, 'price', old.price::text, null
    );
    perform public.write_event_sku_changelog(
      v_event, v_tier, null, 'capacity', old.capacity::text, null
    );
    perform public.write_event_sku_changelog(
      v_event, v_tier, null, 'day_id', old.day_id::text, null
    );
    return old;
  end if;

  v_event := new.event_id;
  v_tier := new.id;
  perform public.write_event_sku_changelog(
    v_event, v_tier, null, 'price', old.price::text, new.price::text
  );
  perform public.write_event_sku_changelog(
    v_event, v_tier, null, 'capacity', old.capacity::text, new.capacity::text
  );
  perform public.write_event_sku_changelog(
    v_event, v_tier, null, 'day_id', old.day_id::text, new.day_id::text
  );
  return new;
end;
$$;

drop trigger if exists ticket_tiers_sku_changelog on public.ticket_tiers;
create trigger ticket_tiers_sku_changelog
after update of price, capacity, day_id or delete
on public.ticket_tiers
for each row
execute function public.audit_ticket_tiers_sku();

create or replace function public.audit_ticket_tier_phases_sku()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event uuid;
  v_tier uuid;
  v_phase uuid;
begin
  v_tier := coalesce(new.tier_id, old.tier_id);
  v_phase := coalesce(new.id, old.id);

  select tt.event_id
    into v_event
  from public.ticket_tiers as tt
  where tt.id = v_tier;

  if v_event is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    perform public.write_event_sku_changelog(
      v_event, v_tier, v_phase, 'price', old.price::text, null
    );
    perform public.write_event_sku_changelog(
      v_event, v_tier, v_phase, 'capacity', old.capacity_limit::text, null
    );
    return old;
  end if;

  perform public.write_event_sku_changelog(
    v_event, v_tier, v_phase, 'price', old.price::text, new.price::text
  );
  perform public.write_event_sku_changelog(
    v_event, v_tier, v_phase, 'capacity',
    old.capacity_limit::text,
    new.capacity_limit::text
  );
  return new;
end;
$$;

drop trigger if exists ticket_tier_phases_sku_changelog on public.ticket_tier_phases;
create trigger ticket_tier_phases_sku_changelog
after update of price, capacity_limit or delete
on public.ticket_tier_phases
for each row
execute function public.audit_ticket_tier_phases_sku();

-- -----------------------------------------------------------------------------
-- 2) Cerrar writes directos de organizador a ticket_tier_phases
-- -----------------------------------------------------------------------------
revoke insert, update, delete on table public.ticket_tier_phases from authenticated;
revoke update on table public.ticket_tier_phases from authenticated;

drop policy if exists ticket_tier_phases_write_organizer on public.ticket_tier_phases;

comment on table public.ticket_tier_phases is
  'Lotes de un ticket_tier. Escritura solo via service_role / RPCs de negocio. SELECT publico.';

-- -----------------------------------------------------------------------------
-- 3) Self-heal de fases por reloj
-- -----------------------------------------------------------------------------
create or replace function public.heal_ticket_tier_phases(p_event_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer := 0;
  v_chunk integer := 0;
  v_tier uuid;
  v_next uuid;
begin
  update public.ticket_tier_phases as p
  set status = 'sold_out'
  from public.ticket_tiers as tt
  where tt.id = p.tier_id
    and (p_event_id is null or tt.event_id = p_event_id)
    and p.status is distinct from 'sold_out'
    and (
      (p.capacity_limit is not null and p.sold >= p.capacity_limit)
      or (p.end_time is not null and p.end_time <= v_now)
    );
  get diagnostics v_chunk = row_count;
  v_updated := v_updated + coalesce(v_chunk, 0);

  update public.ticket_tier_phases as p
  set status = 'scheduled'
  from public.ticket_tiers as tt
  where tt.id = p.tier_id
    and (p_event_id is null or tt.event_id = p_event_id)
    and p.status = 'active'
    and p.start_time is not null
    and p.start_time > v_now;
  get diagnostics v_chunk = row_count;
  v_updated := v_updated + coalesce(v_chunk, 0);

  for v_tier in
    select tt.id
    from public.ticket_tiers as tt
    where (p_event_id is null or tt.event_id = p_event_id)
      and exists (
        select 1
        from public.ticket_tier_phases as p
        where p.tier_id = tt.id
      )
      and not exists (
        select 1
        from public.ticket_tier_phases as p
        where p.tier_id = tt.id
          and p.status = 'active'
      )
  loop
    select p.id
      into v_next
    from public.ticket_tier_phases as p
    where p.tier_id = v_tier
      and p.status = 'scheduled'
      and (p.start_time is null or p.start_time <= v_now)
      and (p.end_time is null or p.end_time > v_now)
      and (p.capacity_limit is null or p.sold < p.capacity_limit)
    order by p.start_time nulls last, p.created_at
    limit 1;

    if v_next is not null then
      update public.ticket_tier_phases
      set status = 'active'
      where id = v_next;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return v_updated;
end;
$$;

revoke all on function public.heal_ticket_tier_phases(uuid) from public;
grant execute on function public.heal_ticket_tier_phases(uuid)
  to anon, authenticated, service_role;

comment on function public.heal_ticket_tier_phases(uuid) is
  'Cierra lotes vencidos/agotados y activa el siguiente en ventana. Se llama al leer stock.';

create or replace function public.purge_expired_checkout_holds(p_event_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_row public.event_ga_cart_holds%rowtype;
  v_order_id uuid;
  v_seating integer := 0;
begin
  if p_event_id is null
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'p_event_id es requerido'
      using errcode = '22023';
  end if;

  for v_row in
    select *
    from public.event_ga_cart_holds as h
    where h.reserved_until <= clock_timestamp()
      and (p_event_id is null or h.event_id = p_event_id)
    order by h.reserved_until asc
    limit 2500
    for update skip locked
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_row.quantity)
    where id = v_row.tier_id;

    delete from public.event_ga_cart_holds where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  where u.status = 'reserved'
    and u.reserved_order_id is null
    and u.reserved_until is not null
    and u.reserved_until <= clock_timestamp()
    and (p_event_id is null or u.event_id = p_event_id);

  get diagnostics v_seating = row_count;
  v_count := v_count + coalesce(v_seating, 0);

  for v_order_id in
    select distinct u.reserved_order_id
    from public.event_seating_units as u
    where u.status = 'reserved'
      and u.reserved_order_id is not null
      and u.reserved_until is not null
      and u.reserved_until <= clock_timestamp()
      and (p_event_id is null or u.event_id = p_event_id)
  loop
    perform public.expire_seating_order(v_order_id);
    v_count := v_count + 1;
  end loop;

  perform public.heal_ticket_tier_phases(p_event_id);

  return v_count;
end;
$$;

revoke all on function public.purge_expired_checkout_holds(uuid) from public;
grant execute on function public.purge_expired_checkout_holds(uuid)
  to anon, authenticated, service_role;
