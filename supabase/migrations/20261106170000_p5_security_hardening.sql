-- =============================================================================
-- P5: add-on RPC auth, door-staff scan transitions, approval RLS,
--     atomic boost activation, settlement request RPC
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) release / activate add-ons: service_role only + ownership defense
-- -----------------------------------------------------------------------------
create or replace function public.release_order_event_items(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_buyer uuid;
  v_event_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    select o.buyer_id into v_buyer
    from public.orders as o
    where o.id = p_order_id;

    if v_buyer is null then
      raise exception 'Orden no encontrada' using errcode = 'P0002';
    end if;

    select t.event_id into v_event_id
    from public.tickets as t
    where t.order_id = p_order_id
    limit 1;

    if auth.uid() is distinct from v_buyer
       and not public.owns_event(v_event_id)
       and not public.is_super_admin() then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
  end if;

  for r in
    select ir.item_id, count(*)::integer as qty
    from public.item_redemptions as ir
    where ir.order_id = p_order_id
      and ir.status = 'pending'
    group by ir.item_id
  loop
    update public.event_items
    set stock = stock + r.qty
    where id = r.item_id;
  end loop;

  update public.item_redemptions
  set status = 'cancelled'
  where order_id = p_order_id
    and status = 'pending';
end;
$$;

revoke all on function public.release_order_event_items(uuid) from public, anon, authenticated;
grant execute on function public.release_order_event_items(uuid) to service_role;

create or replace function public.activate_order_item_redemptions(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_status text;
begin
  -- Prefer service_role (webhook / finalize). Authenticated callers must own the paid order.
  if coalesce(auth.role(), '') <> 'service_role' then
    select o.status::text into v_status
    from public.orders as o
    where o.id = p_order_id
      and (
        o.buyer_id = auth.uid()
        or public.is_super_admin()
      );

    if v_status is null then
      raise exception 'Forbidden' using errcode = '42501';
    end if;

    if v_status <> 'paid' then
      raise exception 'Orden no pagada' using errcode = '23514';
    end if;
  end if;

  update public.item_redemptions
  set status = 'valid'
  where order_id = p_order_id
    and status = 'pending';

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.activate_order_item_redemptions(uuid) from public, anon, authenticated;
grant execute on function public.activate_order_item_redemptions(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 2) Door staff: only valid → used with validated_by = auth.uid()
-- -----------------------------------------------------------------------------
drop policy if exists tickets_update_door_staff on public.tickets;
create policy tickets_update_door_staff
on public.tickets
for update
to authenticated
using (
  public.user_has_event_staff_role(
    event_id,
    (select auth.uid()),
    'door_staff'::public.event_staff_role
  )
  and status = 'valid'::public.ticket_status
)
with check (
  public.user_has_event_staff_role(
    event_id,
    (select auth.uid()),
    'door_staff'::public.event_staff_role
  )
  and status = 'used'::public.ticket_status
  and validated_by = (select auth.uid())
  and scanned_at is not null
);

create or replace function public.enforce_ticket_scan_column_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_door_only boolean := false;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.validated_at is distinct from old.validated_at
       and new.scanned_at is not distinct from old.scanned_at then
      new.scanned_at := new.validated_at;
    elsif new.scanned_at is distinct from old.scanned_at
       and new.validated_at is not distinct from old.validated_at then
      new.validated_at := new.scanned_at;
    end if;

    -- Door staff (non-owner): enforce scan transition machine
    v_is_door_only :=
      public.user_has_event_staff_role(
        old.event_id,
        auth.uid(),
        'door_staff'::public.event_staff_role
      )
      and not public.owns_event(old.event_id)
      and not public.is_super_admin();

    if v_is_door_only and new.status is distinct from old.status then
      if not (
        old.status = 'valid'::public.ticket_status
        and new.status = 'used'::public.ticket_status
      ) then
        raise exception 'TICKET_SCAN_TRANSITION_DENIED'
          using errcode = '42501';
      end if;

      if new.validated_by is distinct from auth.uid() then
        raise exception 'TICKET_VALIDATED_BY_REQUIRED'
          using errcode = '42501';
      end if;

      if new.scanned_at is null then
        raise exception 'TICKET_SCANNED_AT_REQUIRED'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Approval gate on venues / promoters / ticket_tiers writes
-- -----------------------------------------------------------------------------
drop policy if exists "venues_manage_own_or_super_admin" on public.venues;
create policy "venues_manage_own_or_super_admin"
on public.venues
for all
to authenticated
using (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
)
with check (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
);

drop policy if exists promoters_insert_organizer on public.promoters;
create policy promoters_insert_organizer
on public.promoters
for insert
to authenticated
with check (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
);

drop policy if exists promoters_update_organizer_or_self on public.promoters;
create policy promoters_update_organizer_or_self
on public.promoters
for update
to authenticated
using (
  organizer_id = (select auth.uid())
  or user_id = (select auth.uid())
  or (select public.is_super_admin())
)
with check (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or user_id = (select auth.uid())
  or (select public.is_super_admin())
);

drop policy if exists promoters_delete_organizer on public.promoters;
create policy promoters_delete_organizer
on public.promoters
for delete
to authenticated
using (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
);

drop policy if exists "ticket_tiers_insert_own_event" on public.ticket_tiers;
create policy "ticket_tiers_insert_own_event"
on public.ticket_tiers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.organizer_id = (select auth.uid())
      and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
);

drop policy if exists "ticket_tiers_update_own_event" on public.ticket_tiers;
create policy "ticket_tiers_update_own_event"
on public.ticket_tiers
for update
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.organizer_id = (select auth.uid())
  )
  or (select public.is_super_admin())
)
with check (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.organizer_id = (select auth.uid())
      and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
);

drop policy if exists "ticket_tiers_delete_own_event" on public.ticket_tiers;
create policy "ticket_tiers_delete_own_event"
on public.ticket_tiers
for delete
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_tiers.event_id
      and events.organizer_id = (select auth.uid())
      and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
);

-- FreePass tier helper: only event owner / service_role
create or replace function public.ensure_freepass_tier(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.owns_event(p_event_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select tt.id
    into v_tier_id
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.name = 'Cortesía / FreePass'
  limit 1;

  if v_tier_id is not null then
    return v_tier_id;
  end if;

  insert into public.ticket_tiers (
    event_id,
    name,
    price,
    capacity,
    sold,
    bonus_reward
  )
  values (
    p_event_id,
    'Cortesía / FreePass',
    0,
    100000,
    0,
    'CORTESÍA / FREEPASS'
  )
  returning id into v_tier_id;

  return v_tier_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Atomic Boost activate + repair
-- -----------------------------------------------------------------------------
create or replace function public.activate_paid_boost(
  p_subscription_id uuid,
  p_payment_id text,
  p_featured_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_boost public.boost_subscriptions%rowtype;
  v_event public.events%rowtype;
  v_repaired boolean := false;
  v_activated boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_subscription_id is null or nullif(btrim(p_payment_id), '') is null then
    raise exception 'Parámetros inválidos' using errcode = '22023';
  end if;

  select * into v_boost
  from public.boost_subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'boost_not_found');
  end if;

  if v_boost.payment_status = 'pending' then
    update public.boost_subscriptions
    set
      payment_status = 'paid',
      payment_id_mp = p_payment_id,
      updated_at = now()
    where id = v_boost.id
      and payment_status = 'pending';

    if not found then
      -- Lost race; re-read
      select * into v_boost
      from public.boost_subscriptions
      where id = p_subscription_id;
    else
      v_activated := true;
      select * into v_boost
      from public.boost_subscriptions
      where id = p_subscription_id;
    end if;
  end if;

  if v_boost.payment_status <> 'paid' then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_paid',
      'payment_status', v_boost.payment_status
    );
  end if;

  select * into v_event
  from public.events
  where id = v_boost.event_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'event_not_found');
  end if;

  -- Activate or repair featured window when missing / expired / weaker tier.
  if coalesce(v_event.is_featured, false) = false
     or v_event.featured_until is null
     or v_event.featured_until < now()
     or v_event.featured_tier is distinct from v_boost.tier
     or (
       p_featured_until is not null
       and (
         v_event.featured_until is null
         or v_event.featured_until < p_featured_until
       )
     )
  then
    update public.events
    set
      is_featured = true,
      featured_tier = v_boost.tier,
      featured_until = coalesce(p_featured_until, now() + (v_boost.duration_days || ' days')::interval),
      updated_at = now()
    where id = v_event.id;

    v_repaired := not v_activated;
  end if;

  -- Ensure payment_id is recorded even on repair path
  if v_boost.payment_id_mp is distinct from p_payment_id then
    update public.boost_subscriptions
    set
      payment_id_mp = coalesce(payment_id_mp, p_payment_id),
      updated_at = now()
    where id = v_boost.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'activated', v_activated,
    'repaired', v_repaired,
    'event_id', v_boost.event_id,
    'tier', v_boost.tier
  );
end;
$$;

revoke all on function public.activate_paid_boost(uuid, text, timestamptz) from public;
grant execute on function public.activate_paid_boost(uuid, text, timestamptz)
  to service_role;

-- -----------------------------------------------------------------------------
-- 5) Settlements: organizer can request; superadmin completes via RLS
-- -----------------------------------------------------------------------------
create or replace function public.request_organizer_settlement(
  p_period_label text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_summary jsonb;
  v_available numeric(14, 2);
  v_gross numeric(14, 2);
  v_fee numeric(14, 2);
  v_net_liquidable numeric(14, 2);
  v_mp_gross numeric(14, 2);
  v_mp_fee numeric(14, 2);
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  if not public.is_approved_organizer(v_uid) and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_summary := public.get_organizer_finance_summary(v_uid);
  v_available := coalesce((v_summary ->> 'availableToSettle')::numeric, 0);

  if v_available < 1 then
    raise exception 'Sin saldo disponible para liquidar' using errcode = 'P0001';
  end if;

  v_net_liquidable := coalesce((v_summary ->> 'netRevenue')::numeric, 0);
  v_mp_gross := coalesce((v_summary ->> 'mercadopagoGross')::numeric, 0);
  v_mp_fee := coalesce((v_summary ->> 'platformFees')::numeric, 0);

  if v_net_liquidable > 0 then
    v_gross := round(v_available * (v_mp_gross / v_net_liquidable), 2);
    v_fee := round(v_available * (v_mp_fee / v_net_liquidable), 2);
  else
    v_gross := v_available;
    v_fee := 0;
  end if;

  insert into public.organizer_settlements (
    organizer_id,
    gross_amount,
    platform_fee,
    net_amount,
    status,
    period_label,
    notes
  )
  values (
    v_uid,
    v_gross,
    v_fee,
    round(v_available, 2),
    'pending',
    nullif(btrim(coalesce(p_period_label, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.request_organizer_settlement(text, text) from public;
grant execute on function public.request_organizer_settlement(text, text)
  to authenticated, service_role;

create or replace function public.complete_organizer_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.organizer_settlements
  set
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = p_settlement_id
    and status = 'pending';

  if not found then
    raise exception 'Liquidación no encontrada o ya completada' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.complete_organizer_settlement(uuid) from public;
grant execute on function public.complete_organizer_settlement(uuid)
  to authenticated, service_role;
