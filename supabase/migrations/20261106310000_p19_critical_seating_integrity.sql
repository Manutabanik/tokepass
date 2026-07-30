-- =============================================================================
-- P19: Critical seating / scan / transfer / refund integrity
-- =============================================================================

-- 1) Physical seat uniqueness: one layout item per event+sector, one sector per
--    non-general tier.
do $$
begin
  if exists (
    select 1
    from public.event_seating_units
    where status in ('reserved', 'sold')
    group by event_id, sector_id, layout_item_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot deduplicate seating: a physical unit has multiple active locks'
      using errcode = '23505';
  end if;
end;
$$;

-- Duplicates that are not active are stale configuration rows. Keep an active
-- row when present, otherwise the oldest row; historical ticket references are
-- cleared by the existing ON DELETE SET NULL foreign key.
with ranked as (
  select
    id,
    row_number() over (
      partition by event_id, sector_id, layout_item_id
      order by
        case status
          when 'sold' then 0
          when 'reserved' then 1
          when 'blocked' then 2
          else 3
        end,
        created_at,
        id
    ) as position
  from public.event_seating_units
)
delete from public.event_seating_units as u
using ranked as r
where u.id = r.id
  and r.position > 1;

create unique index if not exists event_seating_units_physical_unit_key
  on public.event_seating_units(event_id, sector_id, layout_item_id);

create unique index if not exists ticket_tiers_event_sector_key
  on public.ticket_tiers(event_id, seating_sector_id)
  where layout_type <> 'general'
    and seating_sector_id is not null;

-- 2) Organizers must not mutate runtime locks directly.
revoke insert, update, delete on public.event_seating_units from authenticated;
drop policy if exists event_seating_units_organizer_write on public.event_seating_units;
grant select on public.event_seating_units to authenticated;
grant all on public.event_seating_units to service_role;

-- Published guest-list-only events are resolved through their dedicated claim
-- RPC, not through the generic storefront/PostgREST surface.
drop policy if exists "events_select_published" on public.events;
create policy "events_select_published"
on public.events
for select
to anon, authenticated
using (
  status = 'published'::public.event_status
  and visibility in ('public', 'private')
);

drop policy if exists "ticket_tiers_select_published_event"
  on public.ticket_tiers;
create policy "ticket_tiers_select_published_event"
on public.ticket_tiers
for select
to anon, authenticated
using (
  visibility = 'public'
  and exists (
    select 1
    from public.events as e
    where e.id = ticket_tiers.event_id
      and e.status = 'published'::public.event_status
      and e.visibility in ('public', 'private')
  )
);

create or replace function public.get_event_seating_availability(p_event_id uuid)
returns table (
  id uuid,
  tier_id uuid,
  sector_id text,
  sector_name text,
  layout_item_id text,
  label text,
  row_id text,
  row_number integer,
  row_label text,
  color text,
  layout_type text,
  capacity_per_unit integer,
  status text,
  reserved_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_order_id uuid;
begin
  if not exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and e.status = 'published'::public.event_status
      and e.visibility in ('public', 'private')
  ) then
    return;
  end if;

  for v_order_id in
    select distinct u.reserved_order_id
    from public.event_seating_units as u
    where u.event_id = p_event_id
      and u.status = 'reserved'
      and u.reserved_until <= now()
      and u.reserved_order_id is not null
  loop
    perform public.expire_seating_order(v_order_id);
  end loop;

  return query
  select
    u.id,
    u.tier_id,
    u.sector_id,
    u.sector_name,
    u.layout_item_id,
    u.label,
    u.row_id,
    u.row_number,
    u.row_label,
    u.color,
    u.layout_type,
    u.capacity_per_unit,
    u.status,
    case when u.status = 'reserved' then u.reserved_until else null end
  from public.event_seating_units as u
  join public.ticket_tiers as tt on tt.id = u.tier_id
  where u.event_id = p_event_id
    and tt.visibility = 'public'
  order by
    u.sector_name,
    u.row_number nulls last,
    u.row_label nulls last,
    u.label;
end;
$$;

revoke all on function public.get_event_seating_availability(uuid) from public;
grant execute on function public.get_event_seating_availability(uuid)
  to anon, authenticated, service_role;

-- 3) Free seating units when a paid/pending ticket is cancelled or deleted.
create or replace function public.sync_seating_unit_from_ticket()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
begin
  if tg_op = 'DELETE' then
    if old.seating_unit_id is not null then
      if old.status = 'pending_payment'::public.ticket_status then
        update public.event_seating_units
        set
          status = 'available',
          reserved_by = null,
          reserved_order_id = null,
          reserved_until = null,
          updated_at = now()
        where id = old.seating_unit_id
          and status = 'reserved'
          and reserved_order_id is not distinct from old.order_id;
      elsif old.status = 'valid'::public.ticket_status then
        update public.event_seating_units
        set
          status = 'available',
          sold_order_id = null,
          reserved_by = null,
          reserved_order_id = null,
          reserved_until = null,
          updated_at = now()
        where id = old.seating_unit_id
          and status = 'sold'
          and sold_order_id is not distinct from old.order_id;
      end if;
    end if;
    return old;
  end if;

  if new.seating_unit_id is null then
    return new;
  end if;

  if old.status = 'pending_payment'::public.ticket_status
     and new.status = 'valid'::public.ticket_status then
    update public.event_seating_units
    set
      status = 'sold',
      sold_order_id = new.order_id,
      reserved_by = null,
      reserved_order_id = null,
      reserved_until = null,
      updated_at = now()
    where id = new.seating_unit_id
      and status = 'reserved'
      and reserved_order_id = new.order_id;
  elsif old.status = 'pending_payment'::public.ticket_status
        and new.status <> 'pending_payment'::public.ticket_status then
    update public.event_seating_units
    set
      status = 'available',
      reserved_by = null,
      reserved_order_id = null,
      reserved_until = null,
      updated_at = now()
    where id = new.seating_unit_id
      and status = 'reserved'
      and reserved_order_id is not distinct from new.order_id;
  elsif old.status = 'valid'::public.ticket_status
        and new.status in (
          'cancelled'::public.ticket_status,
          'revoked'::public.ticket_status
        ) then
    update public.event_seating_units
    set
      status = 'available',
      sold_order_id = null,
      reserved_by = null,
      reserved_order_id = null,
      reserved_until = null,
      updated_at = now()
    where id = new.seating_unit_id
      and status = 'sold'
      and sold_order_id is not distinct from new.order_id;
  end if;

  return new;
end;
$$;

-- 4) Refund path also restores seating explicitly (defense in depth).
create or replace function public.cancel_paid_order_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_tier_id uuid;
  v_count integer;
  v_total integer := 0;
  r record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return 0;
  end if;

  for v_tier_id, v_count in
    select t.tier_id, count(*)::integer
    from public.tickets as t
    where t.order_id = p_order_id
      and t.status = 'valid'::public.ticket_status
    group by t.tier_id
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_count)
    where id = v_tier_id;
    v_total := v_total + v_count;
  end loop;

  update public.event_seating_units as u
  set
    status = 'available',
    sold_order_id = null,
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'valid'::public.ticket_status
    and t.seating_unit_id = u.id
    and u.status = 'sold';

  update public.tickets
  set
    status = 'cancelled'::public.ticket_status,
    updated_at = now()
  where order_id = p_order_id
    and status = 'valid'::public.ticket_status;

  for r in
    select ir.item_id, count(*)::integer as qty
    from public.item_redemptions as ir
    where ir.order_id = p_order_id
      and ir.status in ('pending', 'valid')
    group by ir.item_id
  loop
    update public.event_items
    set stock = stock + r.qty
    where id = r.item_id;
  end loop;

  update public.item_redemptions
  set
    status = 'cancelled',
    updated_at = now()
  where order_id = p_order_id
    and status in ('pending', 'valid');

  return v_total;
end;
$$;

revoke all on function public.cancel_paid_order_tickets(uuid) from public;
revoke all on function public.cancel_paid_order_tickets(uuid)
  from anon, authenticated;
grant execute on function public.cancel_paid_order_tickets(uuid) to service_role;

-- 5) Scanner args were inverted (event_id/user_id).
create or replace function public.scan_ticket_admission(
  p_ticket_id uuid,
  p_validated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_ticket public.tickets%rowtype;
  v_next integer;
begin
  if auth.uid() is null
     or auth.uid() is distinct from p_validated_by then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if not public.user_is_event_organizer_or_staff(
    v_ticket.event_id,
    p_validated_by,
    array['door_staff'::public.event_staff_role]
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_ticket.status <> 'valid'::public.ticket_status then
    return jsonb_build_object(
      'ok', false,
      'code', case
        when v_ticket.status in (
          'used'::public.ticket_status,
          'scanned'::public.ticket_status
        ) then 'already_used'
        else 'invalid_status'
      end,
      'admissions_used', v_ticket.admissions_used,
      'max_admissions', v_ticket.max_admissions
    );
  end if;

  if not public.is_ticket_admission_eligible(v_ticket.id) then
    return jsonb_build_object('ok', false, 'code', 'unpaid');
  end if;

  v_next := v_ticket.admissions_used + 1;

  update public.tickets
  set
    admissions_used = v_next,
    status = case
      when v_next >= greatest(1, v_ticket.max_admissions)
        then 'used'::public.ticket_status
      else 'valid'::public.ticket_status
    end,
    scanned_at = case
      when v_next >= greatest(1, v_ticket.max_admissions)
        then now()
      else scanned_at
    end,
    validated_at = now(),
    validated_by = p_validated_by,
    updated_at = now()
  where id = v_ticket.id;

  return jsonb_build_object(
    'ok', true,
    'code', case
      when v_next >= greatest(1, v_ticket.max_admissions)
        then 'complete'
      else 'partial'
    end,
    'admissions_used', v_next,
    'max_admissions', greatest(1, v_ticket.max_admissions),
    'remaining', greatest(0, v_ticket.max_admissions - v_next)
  );
end;
$$;

revoke all on function public.scan_ticket_admission(uuid, uuid) from public;
revoke all on function public.scan_ticket_admission(uuid, uuid) from anon;
grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;

-- 6) Transfers: allow new owner != original buyer, restore anti-scalp + secret
--    rotation, preserve seating identity.
alter table public.tickets
  add column if not exists transferred_from_id uuid
  references public.tickets(id) on delete set null;

create or replace function public.validate_ticket_relations()
returns trigger
language plpgsql
set search_path = pg_catalog, extensions
as $$
declare
  v_related_event_id uuid;
  v_event_visibility text;
  v_tier_visibility text;
  v_order_buyer_id uuid;
  v_promoter_organizer_id uuid;
  v_event_organizer_id uuid;
  v_seat_status public.seat_status;
  v_is_transfer boolean := false;
begin
  select tt.event_id, tt.visibility, e.visibility
    into v_related_event_id, v_tier_visibility, v_event_visibility
  from public.ticket_tiers as tt
  join public.events as e on e.id = tt.event_id
  where tt.id = new.tier_id;

  if v_related_event_id is distinct from new.event_id then
    raise exception 'Ticket tier does not belong to the selected event'
      using errcode = '23514';
  end if;

  if new.status = 'pending_payment'::public.ticket_status
     and (
       v_tier_visibility = 'private'
       or v_event_visibility = 'guest_list_only'
     ) then
    raise exception 'Ticket tier is not available through public checkout'
      using errcode = '42501';
  end if;

  if new.seat_id is not null then
    select ez.event_id, s.status
      into v_related_event_id, v_seat_status
    from public.seats as s
    join public.event_zones as ez on ez.id = s.zone_id
    where s.id = new.seat_id
    for update of s;

    if v_related_event_id is distinct from new.event_id then
      raise exception 'Seat does not belong to the selected event'
        using errcode = '23514';
    end if;

    if v_seat_status = 'sold'::public.seat_status
       and (tg_op = 'INSERT' or old.seat_id is distinct from new.seat_id) then
      raise exception 'Seat is already sold'
        using errcode = '23505';
    end if;
  end if;

  if new.order_id is not null then
    select o.buyer_id, p.organizer_id
      into v_order_buyer_id, v_promoter_organizer_id
    from public.orders as o
    left join public.promoters as p on p.id = o.promoter_id
    where o.id = new.order_id;

    if new.transferred_from_id is not null then
      v_is_transfer := exists (
        select 1
        from public.tickets as src
        where src.id = new.transferred_from_id
          and src.order_id = new.order_id
          and src.event_id = new.event_id
          and src.status = 'transferred'::public.ticket_status
      );
    end if;

    if not v_is_transfer
       and v_order_buyer_id is distinct from new.owner_id then
      raise exception 'Ticket owner does not match the order buyer'
        using errcode = '23514';
    end if;

    if v_promoter_organizer_id is not null then
      select e.organizer_id
        into v_event_organizer_id
      from public.events as e
      where e.id = new.event_id;

      if v_promoter_organizer_id is distinct from v_event_organizer_id then
        raise exception 'Promoter does not belong to the event organizer'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.execute_safe_transfer(
  p_ticket_id uuid,
  p_receiver_email text
)
returns table (
  transfer_id uuid,
  new_ticket_id uuid,
  event_title text,
  receiver_email text,
  receiver_user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_sender uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_email text;
  v_receiver_id uuid;
  v_new_ticket_id uuid;
  v_transfer_id uuid;
  v_event_title text;
  v_secret text;
  v_max_per_user integer;
  v_receiver_count integer;
begin
  if v_sender is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_email := lower(btrim(coalesce(p_receiver_email, '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_RECEIVER_EMAIL' using errcode = '22023';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ticket.owner_id is distinct from v_sender then
    raise exception 'NOT_TICKET_OWNER' using errcode = '42501';
  end if;
  if v_ticket.status::text <> 'valid' then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;
  if v_ticket.transfer_count >= v_ticket.max_transfers_allowed then
    raise exception 'TRANSFER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles as p
    where p.id = v_sender and lower(p.email) = v_email
  ) then
    raise exception 'CANNOT_TRANSFER_TO_SELF' using errcode = '23514';
  end if;

  select p.id into v_receiver_id
  from public.profiles as p
  where lower(p.email) = v_email
  limit 1;

  select e.title, coalesce(e.max_tickets_per_user, 10)
    into v_event_title, v_max_per_user
  from public.events as e
  where e.id = v_ticket.event_id
  for update of e;

  if v_receiver_id is not null then
    select count(*)::integer
      into v_receiver_count
    from public.tickets as t
    where t.event_id = v_ticket.event_id
      and t.owner_id = v_receiver_id
      and t.status in (
        'valid'::public.ticket_status,
        'pending_payment'::public.ticket_status
      );

    if v_receiver_count >= v_max_per_user then
      raise exception 'MAX_TICKETS_PER_USER_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;

  update public.tickets
  set
    status = 'transferred'::public.ticket_status,
    seat_id = null,
    seating_unit_id = null,
    totp_secret = 'xfer_dead_' || replace(gen_random_uuid()::text, '-', ''),
    updated_at = now()
  where id = v_ticket.id;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.tickets (
    event_id,
    tier_id,
    owner_id,
    qr_code,
    status,
    order_id,
    seat_id,
    seating_unit_id,
    max_admissions,
    admissions_used,
    is_dynamic_qr,
    totp_secret,
    max_transfers_allowed,
    transfer_count,
    transferred_from_id
  )
  values (
    v_ticket.event_id,
    v_ticket.tier_id,
    v_receiver_id,
    'xfer_' || replace(gen_random_uuid()::text, '-', ''),
    'valid'::public.ticket_status,
    v_ticket.order_id,
    v_ticket.seat_id,
    v_ticket.seating_unit_id,
    v_ticket.max_admissions,
    v_ticket.admissions_used,
    coalesce(v_ticket.is_dynamic_qr, true),
    v_secret,
    v_ticket.max_transfers_allowed,
    v_ticket.transfer_count + 1,
    v_ticket.id
  )
  returning id into v_new_ticket_id;

  insert into public.ticket_transfers (
    sender_id,
    receiver_email,
    original_ticket_id,
    new_ticket_id
  )
  values (
    v_sender,
    v_email,
    v_ticket.id,
    v_new_ticket_id
  )
  returning id into v_transfer_id;

  return query select
    v_transfer_id,
    v_new_ticket_id,
    coalesce(v_event_title, 'Evento Tokepass'),
    v_email,
    v_receiver_id;
end;
$$;

revoke all on function public.execute_safe_transfer(uuid, text) from public;
grant execute on function public.execute_safe_transfer(uuid, text)
  to authenticated, service_role;

-- 7) Keep P13 finalize semantics; block suspended organizers and harden
--    the idempotent revival path so expired holds are never reactivated.
create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_mp_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_order public.orders%rowtype;
  v_pending_tickets integer := 0;
  v_valid_tickets integer := 0;
  v_activated integer := 0;
  v_updated integer := 0;
  v_tier_id uuid;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null or nullif(btrim(p_mp_payment_id), '') is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'order_not_found');
  end if;

  select count(*)::integer into v_pending_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'pending_payment'::public.ticket_status;

  select count(*)::integer into v_valid_tickets
  from public.tickets as t
  where t.order_id = p_order_id
    and t.status = 'valid'::public.ticket_status;

  if v_order.status = 'paid'
     and v_order.mp_payment_id is not distinct from p_mp_payment_id then
    if v_pending_tickets > 0 then
      if exists (
        select 1
        from public.tickets as t
        join public.event_seating_units as u on u.id = t.seating_unit_id
        where t.order_id = p_order_id
          and t.status = 'pending_payment'::public.ticket_status
          and (
            u.status <> 'reserved'
            or u.reserved_order_id is distinct from p_order_id
            or u.reserved_until <= now()
          )
      ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'order_expired',
          'needs_refund', true
        );
      end if;

      update public.tickets
      set status = 'valid'::public.ticket_status, updated_at = now()
      where order_id = p_order_id
        and status = 'pending_payment'::public.ticket_status;
    end if;

    begin
      perform public.activate_order_item_redemptions(p_order_id);
    exception when undefined_function then null;
    end;

    return jsonb_build_object(
      'ok', true,
      'code', 'already_paid',
      'idempotent', true
    );
  end if;

  if v_order.status = 'paid'
     and v_order.mp_payment_id is distinct from p_mp_payment_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_paid_other_payment',
      'mp_payment_id', v_order.mp_payment_id
    );
  end if;

  if v_order.status = 'expired' then
    return jsonb_build_object(
      'ok', false,
      'code', 'order_expired',
      'needs_refund', true
    );
  end if;

  if v_order.status is distinct from 'pending' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'status', v_order.status
    );
  end if;

  if exists (
    select 1
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.order_id = p_order_id
      and not public.is_approved_organizer(e.organizer_id)
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'organizer_suspended',
      'needs_refund', true
    );
  end if;

  if exists (
    select 1
    from public.tickets as t
    join public.event_seating_units as u on u.id = t.seating_unit_id
    where t.order_id = p_order_id
      and (
        u.status <> 'reserved'
        or u.reserved_order_id is distinct from p_order_id
        or u.reserved_until <= now()
      )
  ) then
    for v_tier_id, v_count in
      select t.tier_id, count(*)::integer
      from public.tickets as t
      where t.order_id = p_order_id
        and t.status = 'pending_payment'::public.ticket_status
      group by t.tier_id
    loop
      update public.ticket_tiers
      set sold = greatest(0, sold - v_count)
      where id = v_tier_id;
    end loop;

    update public.tickets
    set status = 'cancelled'::public.ticket_status, updated_at = now()
    where order_id = p_order_id
      and status = 'pending_payment'::public.ticket_status;

    update public.orders
    set status = 'expired', updated_at = now()
    where id = p_order_id and status = 'pending';

    return jsonb_build_object(
      'ok', false,
      'code', 'seating_hold_expired',
      'needs_refund', true
    );
  end if;

  if v_pending_tickets = 0 and v_valid_tickets = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_tickets',
      'needs_refund', true
    );
  end if;

  if v_pending_tickets > 0 then
    update public.tickets
    set status = 'valid'::public.ticket_status, updated_at = now()
    where order_id = p_order_id
      and status = 'pending_payment'::public.ticket_status;

    get diagnostics v_activated = row_count;
    if v_activated is distinct from v_pending_tickets then
      raise exception 'TICKET_ACTIVATION_MISMATCH'
        using errcode = 'P0001';
    end if;
  end if;

  begin
    perform public.activate_order_item_redemptions(p_order_id);
  exception when undefined_function then null;
  end;

  update public.orders
  set
    status = 'paid',
    mp_payment_id = p_mp_payment_id,
    updated_at = now()
  where id = p_order_id and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'ORDER_STATUS_RACE' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'paid',
    'tickets_activated', coalesce(v_activated, 0),
    'idempotent', false
  );
end;
$$;

revoke all on function public.finalize_paid_order(uuid, text) from public;
revoke all on function public.finalize_paid_order(uuid, text)
  from anon, authenticated;
grant execute on function public.finalize_paid_order(uuid, text)
  to service_role;

-- 8) Ledger totals must cover the full filtered dataset, not only the paged
--    rows returned to the dashboard.
create or replace function public.get_platform_orders_ledger_totals(
  p_organizer_id uuid default null,
  p_event_id uuid default null,
  p_status text default null
)
returns table (
  gross numeric,
  platform_fee numeric,
  organizer_net numeric,
  order_count bigint,
  paid_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_status is not null
     and v_status not in ('pending', 'paid', 'failed', 'expired') then
    raise exception 'Invalid order status' using errcode = '22023';
  end if;

  return query
  with order_context as (
    select distinct on (t.order_id)
      t.order_id,
      e.id as event_id,
      e.organizer_id
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.order_id is not null
    order by t.order_id, t.created_at asc
  )
  select
    round(coalesce(sum(o.total_amount) filter (where o.status = 'paid'), 0), 2),
    round(coalesce(sum(o.service_charge) filter (where o.status = 'paid'), 0), 2),
    round(
      coalesce(
        sum(greatest(o.total_amount - o.service_charge, 0))
          filter (where o.status = 'paid'),
        0
      ),
      2
    ),
    count(*),
    count(*) filter (where o.status = 'paid')
  from public.orders as o
  left join order_context as oc on oc.order_id = o.id
  where (p_organizer_id is null or oc.organizer_id = p_organizer_id)
    and (p_event_id is null or oc.event_id = p_event_id)
    and (v_status is null or o.status::text = v_status);
end;
$$;

revoke all on function public.get_platform_orders_ledger_totals(uuid, uuid, text)
  from public, anon;
grant execute on function public.get_platform_orders_ledger_totals(uuid, uuid, text)
  to authenticated, service_role;

-- 9) Serialize settlement requests per organizer so two concurrent requests
--    cannot both consume the same available balance.
create or replace function public.request_organizer_settlement(
  p_period_label text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_summary jsonb;
  v_available numeric(14, 2);
  v_gross numeric(14, 2);
  v_fee numeric(14, 2);
  v_net_liquidable numeric(14, 2);
  v_mp_gross numeric(14, 2);
  v_platform_fees numeric(14, 2);
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  if not public.is_approved_organizer(v_uid)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  v_summary := public.get_organizer_finance_summary(v_uid);
  v_available := coalesce((v_summary ->> 'availableToSettle')::numeric, 0);

  if v_available < 1 then
    raise exception 'Sin saldo disponible para liquidar'
      using errcode = 'P0001';
  end if;

  v_net_liquidable := coalesce((v_summary ->> 'netRevenue')::numeric, 0);
  v_mp_gross := coalesce((v_summary ->> 'mercadopagoGross')::numeric, 0);
  v_platform_fees := coalesce((v_summary ->> 'platformFees')::numeric, 0);

  if v_net_liquidable > 0 then
    v_gross := round(v_available * (v_mp_gross / v_net_liquidable), 2);
    v_fee := round(v_available * (v_platform_fees / v_net_liquidable), 2);
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

revoke all on function public.request_organizer_settlement(text, text)
  from public, anon;
grant execute on function public.request_organizer_settlement(text, text)
  to authenticated, service_role;
