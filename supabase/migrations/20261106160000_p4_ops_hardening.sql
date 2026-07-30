-- =============================================================================
-- P4: guest-list abuse hardening, staff expiry, ticket scan grants,
--     refund add-ons, create_complete_event venue reuse
-- =============================================================================

-- -----------------------------------------------------------------------------
-- H1: unique email per guest list + rate-limit inside register RPC
-- -----------------------------------------------------------------------------
-- Normalize existing emails before unique index.
update public.guest_list_entries
set email = lower(btrim(email))
where email is not null;

-- Drop duplicate emails keeping the oldest entry per (list, email).
delete from public.guest_list_entries as g
using public.guest_list_entries as d
where g.guest_list_id = d.guest_list_id
  and g.email is not null
  and d.email is not null
  and lower(g.email) = lower(d.email)
  and g.created_at > d.created_at;

create unique index if not exists guest_list_entries_list_email_uidx
  on public.guest_list_entries (guest_list_id, lower(email))
  where email is not null and length(btrim(email)) > 0;

-- Rate limit: only service_role (server actions). Prevents anon bucket poisoning.
revoke all on function public.consume_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_rate_limit(text, integer, integer)
  from anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

create or replace function public.register_guest_list_entry(
  p_list_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_client_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.guest_lists%rowtype;
  v_entry_id uuid;
  v_email text;
  v_bucket text;
begin
  -- Public registration only via service_role (server action) after app checks.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_list
  from public.guest_lists
  where id = p_list_id
  for update;

  if not found then
    raise exception 'Lista no encontrada' using errcode = 'P0002';
  end if;

  if v_list.valid_until < now() then
    raise exception 'El horario de esta lista ya venció' using errcode = '23514';
  end if;

  if v_list.used_guests >= v_list.max_guests then
    raise exception 'Lista completa' using errcode = 'P0001';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) < 2 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_REQUIRED' using errcode = '22023';
  end if;

  -- Fixed server-side rate limits (caller cannot choose limit/window).
  if not public.consume_rate_limit(
    'guestlist:email:' || v_email,
    5,
    3600
  ) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  v_bucket := nullif(btrim(coalesce(p_client_key, '')), '');
  if v_bucket is not null then
    if not public.consume_rate_limit(
      'guestlist:client:' || p_list_id::text || ':' || v_bucket,
      8,
      900
    ) then
      raise exception 'RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1
    from public.guest_list_entries as e
    where e.guest_list_id = p_list_id
      and lower(e.email) = v_email
  ) then
    raise exception 'EMAIL_ALREADY_REGISTERED' using errcode = '23505';
  end if;

  update public.guest_lists
  set used_guests = used_guests + 1
  where id = p_list_id
    and used_guests < max_guests;

  if not found then
    raise exception 'Lista completa' using errcode = 'P0001';
  end if;

  insert into public.guest_list_entries (
    guest_list_id,
    full_name,
    email,
    phone,
    status
  )
  values (
    p_list_id,
    btrim(p_full_name),
    v_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    'pending'
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

revoke all on function public.register_guest_list_entry(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.register_guest_list_entry(uuid, text, text, text, text)
  from public, anon, authenticated;
drop function if exists public.register_guest_list_entry(uuid, text, text, text);
grant execute on function public.register_guest_list_entry(uuid, text, text, text, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- M2: guest check-in requires organizer or active door staff
-- -----------------------------------------------------------------------------
create or replace function public.mark_guest_entry_checked_in(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    update public.guest_list_entries
    set status = 'checked_in'
    where ticket_id = p_ticket_id
      and status in ('claimed', 'pending');
    return;
  end if;

  if auth.uid() is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select t.event_id
    into v_event_id
  from public.tickets as t
  where t.id = p_ticket_id;

  if v_event_id is null then
    raise exception 'Ticket no encontrado' using errcode = 'P0002';
  end if;

  if not public.user_is_event_organizer_or_staff(
    v_event_id,
    auth.uid(),
    array['door_staff'::public.event_staff_role]
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.guest_list_entries
  set status = 'checked_in'
  where ticket_id = p_ticket_id
    and status in ('claimed', 'pending');
end;
$$;

-- Alias requested by audit backlog
create or replace function public.check_in_guest(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mark_guest_entry_checked_in(p_ticket_id);
end;
$$;

revoke all on function public.check_in_guest(uuid) from public;
grant execute on function public.check_in_guest(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- M1: staff assignment expiry / active flag
-- -----------------------------------------------------------------------------
alter table public.event_staff_assignments
  add column if not exists is_active boolean not null default true,
  add column if not exists expires_at timestamptz;

create index if not exists event_staff_assignments_active_idx
  on public.event_staff_assignments (event_id, user_id)
  where is_active = true;

drop policy if exists event_staff_update_organizer on public.event_staff_assignments;
create policy event_staff_update_organizer
on public.event_staff_assignments
for update
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.events as e
    where e.id = event_id
      and e.organizer_id = (select auth.uid())
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.events as e
    where e.id = event_id
      and e.organizer_id = (select auth.uid())
  )
);

create or replace function public.user_has_event_staff_role(
  p_event_id uuid,
  p_user_id uuid,
  p_role public.event_staff_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_staff_assignments as esa
    where esa.event_id = p_event_id
      and esa.user_id = p_user_id
      and esa.role = p_role
      and esa.is_active = true
      and (esa.expires_at is null or esa.expires_at > now())
  );
$$;

create or replace function public.user_is_event_organizer_or_staff(
  p_event_id uuid,
  p_user_id uuid,
  p_roles public.event_staff_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.events as e
      where e.id = p_event_id
        and e.organizer_id = p_user_id
    )
    or exists (
      select 1
      from public.event_staff_assignments as esa
      where esa.event_id = p_event_id
        and esa.user_id = p_user_id
        and esa.is_active = true
        and (esa.expires_at is null or esa.expires_at > now())
        and (
          p_roles is null
          or esa.role = any (p_roles)
        )
    );
$$;

drop policy if exists events_select_staff_assigned on public.events;
create policy events_select_staff_assigned
on public.events
for select
to authenticated
using (
  exists (
    select 1
    from public.event_staff_assignments as esa
    where esa.event_id = events.id
      and esa.user_id = (select auth.uid())
      and esa.is_active = true
      and (esa.expires_at is null or esa.expires_at > now())
  )
);

-- -----------------------------------------------------------------------------
-- H2: ticket column grants for scan only + defense trigger
-- -----------------------------------------------------------------------------
alter table public.tickets
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references public.profiles (id) on delete set null;

-- Backfill from scanned_at
update public.tickets
set validated_at = scanned_at
where scanned_at is not null
  and validated_at is null;

revoke update on public.tickets from authenticated, anon;
grant update (status, scanned_at, validated_at, validated_by)
  on public.tickets to authenticated;
grant update (
  status, order_id, seat_id, is_dynamic_qr, owner_id, scanned_at,
  validated_at, validated_by, totp_secret, qr_code, transfer_count
) on public.tickets to service_role;

create or replace function public.enforce_ticket_scan_column_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Keep scanned_at and validated_at aligned when either is set.
    if new.validated_at is distinct from old.validated_at
       and new.scanned_at is not distinct from old.scanned_at then
      new.scanned_at := new.validated_at;
    elsif new.scanned_at is distinct from old.scanned_at
       and new.validated_at is not distinct from old.validated_at then
      new.validated_at := new.scanned_at;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_scan_column_guard on public.tickets;
create trigger tickets_scan_column_guard
  before update on public.tickets
  for each row
  execute function public.enforce_ticket_scan_column_guard();

-- -----------------------------------------------------------------------------
-- H3: cancel add-on redemptions on paid-order refund
-- -----------------------------------------------------------------------------
create or replace function public.cancel_paid_order_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
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

  update public.tickets
  set
    status = 'cancelled'::public.ticket_status,
    updated_at = now()
  where order_id = p_order_id
    and status = 'valid'::public.ticket_status;

  -- Restore stock for unused bar add-ons and cancel irreversibly.
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

-- -----------------------------------------------------------------------------
-- H6: create_complete_event_tx accepts existing venue_id
-- Body = P3 + optional payload.venue_id reuse.
-- -----------------------------------------------------------------------------
create or replace function public.create_complete_event_tx(
  payload jsonb,
  p_organizer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue_id uuid;
  v_event_id uuid;
  v_zone_id uuid;
  v_zone_ids uuid[] := '{}';
  v_zone jsonb;
  v_tier jsonb;
  v_zone_index integer;
  v_zone_type public.zone_type;
  v_zone_capacity integer;
  v_rows integer;
  v_seats_per_row integer;
  v_row_idx integer;
  v_seat_idx integer;
  v_row_label text;
  v_venue_name text;
  v_venue_location text;
  v_venue_capacity integer;
  v_title text;
  v_description text;
  v_date timestamptz;
  v_location text;
  v_image_url text;
  v_time_limit time;
  v_bonus_reward text;
  v_existing_venue_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_organizer_id) then
    raise exception 'Forbidden: no puedes crear eventos en nombre de otro usuario'
      using errcode = '42501';
  end if;

  if not public.is_approved_organizer(p_organizer_id) then
    raise exception
      'Forbidden: el organizador no está aprobado o no tiene permisos de productor'
      using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'payload debe ser un objeto JSON'
      using errcode = '22023';
  end if;

  v_title := nullif(btrim(payload ->> 'title'), '');
  v_description := nullif(btrim(payload ->> 'description'), '');
  v_location := nullif(btrim(payload ->> 'location'), '');
  v_image_url := coalesce(
    nullif(btrim(payload ->> 'flyer_url'), ''),
    nullif(btrim(payload ->> 'image_url'), '')
  );

  begin
    v_date := (payload ->> 'date')::timestamptz;
  exception
    when others then
      raise exception 'Fecha del evento inválida'
        using errcode = '22007';
  end;

  if v_title is null then
    raise exception 'El título del evento es obligatorio'
      using errcode = '22023';
  end if;

  if v_date is null then
    raise exception 'La fecha del evento es obligatoria'
      using errcode = '22023';
  end if;

  begin
    v_existing_venue_id := nullif(btrim(payload ->> 'venue_id'), '')::uuid;
  exception
    when others then
      raise exception 'venue_id inválido' using errcode = '22P02';
  end;

  if v_existing_venue_id is not null then
    select v.id, v.name, v.location, v.capacity
      into v_venue_id, v_venue_name, v_venue_location, v_venue_capacity
    from public.venues as v
    where v.id = v_existing_venue_id
      and v.organizer_id = p_organizer_id;

    if v_venue_id is null then
      raise exception 'Recinto no encontrado o no pertenece al organizador'
        using errcode = '42501';
    end if;
  else
    v_venue_name := nullif(btrim(payload #>> '{venue,name}'), '');
    v_venue_location := coalesce(
      nullif(btrim(payload #>> '{venue,location}'), ''),
      v_venue_name,
      v_location
    );
    v_venue_capacity := coalesce((payload #>> '{venue,capacity}')::integer, 0);

    if v_venue_name is null then
      raise exception 'El nombre del recinto es obligatorio'
        using errcode = '22023';
    end if;

    if v_venue_capacity <= 0 then
      raise exception 'La capacidad del recinto debe ser mayor a cero'
        using errcode = '22023';
    end if;

    insert into public.venues (organizer_id, name, location, capacity)
    values (p_organizer_id, v_venue_name, v_venue_location, v_venue_capacity)
    returning id into v_venue_id;
  end if;

  if v_location is null then
    v_location := v_venue_location;
  end if;

  if payload -> 'zones' is null
     or jsonb_typeof(payload -> 'zones') <> 'array'
     or jsonb_array_length(payload -> 'zones') = 0 then
    raise exception 'Debes definir al menos una zona'
      using errcode = '22023';
  end if;

  if payload -> 'tiers' is null
     or jsonb_typeof(payload -> 'tiers') <> 'array'
     or jsonb_array_length(payload -> 'tiers') = 0 then
    raise exception 'Debes definir al menos un tipo de entrada'
      using errcode = '22023';
  end if;

  insert into public.events (
    organizer_id,
    title,
    description,
    date,
    location,
    image_url,
    flyer_url,
    venue_id,
    status
  )
  values (
    p_organizer_id,
    v_title,
    v_description,
    v_date,
    coalesce(v_location, v_venue_location, v_venue_name),
    v_image_url,
    v_image_url,
    v_venue_id,
    'draft'::public.event_status
  )
  returning id into v_event_id;

  for v_zone in select value from jsonb_array_elements(payload -> 'zones')
  loop
    begin
      v_zone_type := (v_zone ->> 'type')::public.zone_type;
    exception
      when others then
        raise exception 'Tipo de zona inválido: %', v_zone ->> 'type'
          using errcode = '22P02';
    end;

    v_zone_capacity := coalesce((v_zone ->> 'capacity')::integer, 0);

    if nullif(btrim(v_zone ->> 'name'), '') is null then
      raise exception 'Cada zona debe tener un nombre' using errcode = '22023';
    end if;

    if v_zone_capacity <= 0 then
      raise exception 'La capacidad de la zona "%" debe ser mayor a cero',
        v_zone ->> 'name' using errcode = '22023';
    end if;

    insert into public.event_zones (event_id, name, type, capacity)
    values (v_event_id, btrim(v_zone ->> 'name'), v_zone_type, v_zone_capacity)
    returning id into v_zone_id;

    v_zone_ids := array_append(v_zone_ids, v_zone_id);

    if v_zone_type = 'reserved_seating'::public.zone_type then
      v_rows := coalesce((v_zone ->> 'rows')::integer, 0);
      v_seats_per_row := coalesce((v_zone ->> 'seats_per_row')::integer, 0);

      if v_rows <= 0 or v_seats_per_row <= 0 then
        raise exception 'La zona "%" requiere filas y asientos por fila',
          v_zone ->> 'name' using errcode = '22023';
      end if;

      if (v_rows * v_seats_per_row) > 5000 then
        raise exception 'La zona "%" supera el máximo de 5000 asientos por creación',
          v_zone ->> 'name' using errcode = '22023';
      end if;

      for v_row_idx in 1..v_rows loop
        if v_row_idx <= 26 then
          v_row_label := chr(64 + v_row_idx);
        else
          v_row_label :=
            chr(64 + ((v_row_idx - 1) / 26))
            || chr(65 + ((v_row_idx - 1) % 26));
        end if;

        for v_seat_idx in 1..v_seats_per_row loop
          insert into public.seats (zone_id, row_label, seat_number, status)
          values (
            v_zone_id,
            v_row_label,
            v_seat_idx::text,
            'available'::public.seat_status
          );
        end loop;
      end loop;
    end if;
  end loop;

  for v_tier in select value from jsonb_array_elements(payload -> 'tiers')
  loop
    if nullif(btrim(v_tier ->> 'name'), '') is null then
      raise exception 'Cada tier debe tener un nombre' using errcode = '22023';
    end if;

    if coalesce((v_tier ->> 'capacity')::integer, 0) < 1 then
      raise exception 'La capacidad del tier "%" debe ser mayor a cero',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    if coalesce((v_tier ->> 'price')::numeric, -1) < 0 then
      raise exception 'El precio del tier "%" no puede ser negativo',
        v_tier ->> 'name' using errcode = '22023';
    end if;

    v_zone_index := coalesce((v_tier ->> 'zone_index')::integer, 0);
    v_zone_id := null;

    if v_zone_index >= 0 and v_zone_index < cardinality(v_zone_ids) then
      v_zone_id := v_zone_ids[v_zone_index + 1];
    end if;

    v_time_limit := null;
    if nullif(btrim(v_tier ->> 'time_limit'), '') is not null then
      begin
        v_time_limit := (v_tier ->> 'time_limit')::time;
      exception
        when others then
          raise exception 'time_limit inválido en tier "%"', v_tier ->> 'name'
            using errcode = '22007';
      end;
    end if;

    v_bonus_reward := nullif(btrim(v_tier ->> 'bonus_reward'), '');

    insert into public.ticket_tiers (
      event_id, name, price, capacity, sold, time_limit, bonus_reward, zone_id
    )
    values (
      v_event_id,
      btrim(v_tier ->> 'name'),
      (v_tier ->> 'price')::numeric(12, 2),
      (v_tier ->> 'capacity')::integer,
      0,
      v_time_limit,
      v_bonus_reward,
      v_zone_id
    );
  end loop;

  return v_event_id;

exception
  when others then
    raise exception 'create_complete_event_tx: %', sqlerrm
      using errcode = sqlstate;
end;
$$;
