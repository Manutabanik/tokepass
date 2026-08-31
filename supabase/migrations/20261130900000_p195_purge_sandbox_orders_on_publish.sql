-- p195 · Al publicar, borrar tickets is_test y anular las órdenes sandbox.
-- El reset anterior borraba tickets y después no encontraba esas órdenes.

create or replace function public.reset_event_test_inventory_internal(
  p_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
  v_order_ids uuid[] := '{}'::uuid[];
begin
  if p_event_id is null then
    raise exception 'event_id requerido' using errcode = '22023';
  end if;

  if not exists (select 1 from public.events as e where e.id = p_event_id) then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;

  perform set_config('tokepass.resetting_test_inventory', '1', true);

  select coalesce(array_agg(distinct t.order_id), '{}'::uuid[])
    into v_order_ids
  from public.tickets as t
  where t.event_id = p_event_id
    and coalesce(t.is_test, false) = true
    and t.order_id is not null;

  delete from public.event_ga_cart_holds
  where event_id = p_event_id;

  if to_regclass('public.ticket_action_consents') is not null then
    execute $sql$
      delete from public.ticket_action_consents as c
      where exists (
        select 1
        from public.tickets as t
        where t.id = c.ticket_id
          and t.event_id = $1
          and coalesce(t.is_test, false) = true
      )
    $sql$
    using p_event_id;
  end if;

  if to_regclass('public.payouts_pending') is not null then
    execute $sql$
      delete from public.payouts_pending as pay
      where exists (
        select 1
        from public.ticket_resale_listings as l
        join public.tickets as t on t.id = l.ticket_id
        where l.id = pay.listing_id
          and t.event_id = $1
          and coalesce(t.is_test, false) = true
      )
    $sql$
    using p_event_id;
  end if;

  if to_regclass('public.ticket_resale_listings') is not null then
    execute $sql$
      delete from public.ticket_resale_listings as l
      where exists (
        select 1
        from public.tickets as t
        where t.id = l.ticket_id
          and t.event_id = $1
          and coalesce(t.is_test, false) = true
      )
    $sql$
    using p_event_id;
  end if;

  delete from public.ticket_transfers as tr
  where exists (
    select 1
    from public.tickets as t
    where t.event_id = p_event_id
      and coalesce(t.is_test, false) = true
      and t.id in (tr.original_ticket_id, tr.new_ticket_id)
  );

  delete from public.tickets as t
  where t.event_id = p_event_id
    and coalesce(t.is_test, false) = true;

  get diagnostics v_deleted = row_count;

  if coalesce(array_length(v_order_ids, 1), 0) > 0 then
    update public.orders as o
    set
      status = 'expired',
      is_test = true,
      environment = 'test',
      payment_method = coalesce(nullif(o.payment_method, ''), 'test_sandbox'),
      updated_at = now()
    where o.id = any(v_order_ids)
      and coalesce(o.is_test, false) = true
      and not exists (
        select 1
        from public.tickets as t
        where t.order_id = o.id
          and coalesce(t.is_test, false) = false
      );
  end if;

  update public.event_seating_units as u
  set
    status = 'available',
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    sold_order_id = null,
    updated_at = now()
  where u.event_id = p_event_id
    and u.status in ('sold', 'reserved')
    and (
      exists (
        select 1
        from public.orders as o
        where o.id in (u.sold_order_id, u.reserved_order_id)
          and coalesce(o.is_test, false) = true
      )
      or not exists (
        select 1
        from public.tickets as t
        where t.seating_unit_id = u.id
          and coalesce(t.is_test, false) = false
          and t.status not in (
            'cancelled'::public.ticket_status,
            'revoked'::public.ticket_status
          )
      )
    );

  update public.ticket_tiers as tt
  set sold = coalesce(units.qty, 0)
  from (
    select
      t.tier_id,
      count(
        distinct coalesce(nullif(t.group_id::text, ''), t.id::text)
      )::integer as qty
    from public.tickets as t
    left join public.orders as o on o.id = t.order_id
    where t.event_id = p_event_id
      and coalesce(t.is_test, false) = false
      and coalesce(o.is_test, false) = false
      and t.status not in (
        'cancelled'::public.ticket_status,
        'revoked'::public.ticket_status
      )
    group by t.tier_id
  ) as units
  where tt.id = units.tier_id
    and tt.event_id = p_event_id;

  update public.ticket_tiers as tt
  set sold = 0
  where tt.event_id = p_event_id
    and not exists (
      select 1
      from public.tickets as t
      left join public.orders as o on o.id = t.order_id
      where t.tier_id = tt.id
        and coalesce(t.is_test, false) = false
        and coalesce(o.is_test, false) = false
        and t.status not in (
          'cancelled'::public.ticket_status,
          'revoked'::public.ticket_status
        )
    );

  update public.ticket_tier_phases as p
  set sold = coalesce(units.qty, 0)
  from (
    select
      t.phase_id,
      count(
        distinct coalesce(nullif(t.group_id::text, ''), t.id::text)
      )::integer as qty
    from public.tickets as t
    left join public.orders as o on o.id = t.order_id
    where t.event_id = p_event_id
      and t.phase_id is not null
      and coalesce(t.is_test, false) = false
      and coalesce(o.is_test, false) = false
      and t.status not in (
        'cancelled'::public.ticket_status,
        'revoked'::public.ticket_status
      )
    group by t.phase_id
  ) as units
  where p.id = units.phase_id;

  update public.ticket_tier_phases as p
  set sold = 0
  where p.tier_id in (
      select tt.id from public.ticket_tiers as tt where tt.event_id = p_event_id
    )
    and not exists (
      select 1
      from public.tickets as t
      left join public.orders as o on o.id = t.order_id
      where t.phase_id = p.id
        and t.event_id = p_event_id
        and coalesce(t.is_test, false) = false
        and coalesce(o.is_test, false) = false
        and t.status not in (
          'cancelled'::public.ticket_status,
          'revoked'::public.ticket_status
        )
    );

  return coalesce(v_deleted, 0);
end;
$$;

create or replace function public.events_reset_test_inventory_on_go_live()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.status::text in ('draft', 'pending_approval', 'needs_revision', 'rejected')
     and new.status::text not in (
       'draft',
       'pending_approval',
       'needs_revision',
       'rejected'
     ) then
    perform public.reset_event_test_inventory_internal(new.id);
  end if;
  return new;
end;
$$;
