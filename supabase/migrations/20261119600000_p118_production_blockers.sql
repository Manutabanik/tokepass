-- =============================================================================
-- Tokepass · P118 · Bloqueantes de produccion (C-AUTH-1, H-INV-1)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- C-AUTH-1: PIN POS solo del organizer dueno o super_admin
-- -----------------------------------------------------------------------------
create or replace function public.verify_pos_supervisor_pin(
  p_event_id uuid,
  p_pin text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_hash text;
  v_uid uuid := auth.uid();
begin
  if p_pin is null or length(btrim(p_pin)) < 4 then
    return false;
  end if;

  select e.pos_supervisor_pin_hash
    into v_hash
  from public.events e
  where e.id = p_event_id;

  if v_hash is null or btrim(v_hash) = '' then
    if upper(btrim(p_pin)) = 'ORG' and v_uid is not null then
      return exists (
        select 1
        from public.events e
        where e.id = p_event_id
          and (
            e.organizer_id = v_uid
            or public.is_super_admin()
          )
      );
    end if;
    return false;
  end if;

  return v_hash = public.hash_pos_supervisor_pin(p_pin);
end;
$$;

revoke all on function public.verify_pos_supervisor_pin(uuid, text) from public;
grant execute on function public.verify_pos_supervisor_pin(uuid, text)
  to authenticated, service_role;

create or replace function public.set_pos_supervisor_pin(
  p_event_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_pin is null or length(btrim(p_pin)) < 4 or length(btrim(p_pin)) > 12 then
    raise exception 'PIN_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        e.organizer_id = v_uid
        or public.is_super_admin()
      )
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.events
  set
    pos_supervisor_pin_hash = public.hash_pos_supervisor_pin(p_pin),
    updated_at = now()
  where id = p_event_id;

  return true;
end;
$$;

revoke all on function public.set_pos_supervisor_pin(uuid, text) from public;
grant execute on function public.set_pos_supervisor_pin(uuid, text)
  to authenticated, service_role;

create or replace function public.set_pos_cashier_pin(
  p_assignment_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN_INVALID' using errcode = '22023';
  end if;

  select esa.event_id
    into v_event_id
  from public.event_staff_assignments as esa
  where esa.id = p_assignment_id
    and esa.role = 'cashier'
    and esa.is_active = true;

  if v_event_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.events e
    where e.id = v_event_id
      and (
        e.organizer_id = v_uid
        or public.is_super_admin()
      )
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.event_staff_assignments
  set pos_security_pin_hash = public.hash_pos_supervisor_pin(p_pin)
  where id = p_assignment_id;

  return true;
end;
$$;

revoke all on function public.set_pos_cashier_pin(uuid, text) from public;
grant execute on function public.set_pos_cashier_pin(uuid, text)
  to authenticated, service_role;

create or replace function public.bootstrap_pos_cashier_pin(
  p_event_id uuid,
  p_new_pin text,
  p_admin_pin text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_manager boolean := false;
  v_assignment_id uuid;
  v_hash text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN_INVALID' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        e.organizer_id = v_uid
        or public.is_super_admin()
      )
  ) into v_is_manager;

  if not v_is_manager then
    if not public.verify_pos_supervisor_pin(p_event_id, p_admin_pin) then
      raise exception 'SUPERVISOR_PIN' using errcode = '42501';
    end if;
  end if;

  select esa.id, esa.pos_security_pin_hash
    into v_assignment_id, v_hash
  from public.event_staff_assignments as esa
  where esa.event_id = p_event_id
    and esa.user_id = v_uid
    and esa.role = 'cashier'
    and esa.is_active = true
    and (esa.expires_at is null or esa.expires_at > now())
  order by esa.created_at desc
  limit 1;

  if v_assignment_id is null then
    if v_is_manager then
      update public.events
      set
        pos_supervisor_pin_hash = public.hash_pos_supervisor_pin(p_new_pin),
        updated_at = now()
      where id = p_event_id;
      return true;
    end if;
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.event_staff_assignments
  set pos_security_pin_hash = public.hash_pos_supervisor_pin(p_new_pin)
  where id = v_assignment_id;

  return true;
end;
$$;

revoke all on function public.bootstrap_pos_cashier_pin(uuid, text, text) from public;
grant execute on function public.bootstrap_pos_cashier_pin(uuid, text, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- H-INV-1: tope por DNI/email dentro de la TX de reserva
-- -----------------------------------------------------------------------------
create or replace function public.assert_holder_identity_ticket_cap(
  p_event_id uuid,
  p_holder_dni text,
  p_holder_email text,
  p_requested integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dni text := nullif(btrim(coalesce(p_holder_dni, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_holder_email, ''))), '');
  v_max integer;
  v_held integer;
begin
  if p_event_id is null or coalesce(p_requested, 0) <= 0 then
    return;
  end if;
  if v_dni is null and v_email is null then
    return;
  end if;

  select coalesce(e.max_tickets_per_user, 10)
    into v_max
  from public.events as e
  where e.id = p_event_id;

  if v_max is null then
    return;
  end if;

  if v_dni is not null then
    perform pg_advisory_xact_lock(
      hashtext('holder-cap'),
      hashtext(p_event_id::text || ':dni:' || v_dni)
    );
  end if;
  if v_email is not null then
    perform pg_advisory_xact_lock(
      hashtext('holder-cap'),
      hashtext(p_event_id::text || ':email:' || v_email)
    );
  end if;

  v_held := public.count_guest_identity_tickets(p_event_id, v_dni, v_email);
  if (coalesce(v_held, 0) + p_requested) > v_max then
    raise exception 'MAX_TICKETS_PER_USER_EXCEEDED'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_holder_identity_ticket_cap(uuid, text, text, integer)
  from public;
grant execute on function public.assert_holder_identity_ticket_cap(uuid, text, text, integer)
  to authenticated, service_role;

create or replace function public.reserve_unified_cart_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid,
  p_holder_dni text,
  p_holder_email text
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_requested integer := 0;
  v_order uuid;
  v_row record;
  v_dni text := nullif(btrim(coalesce(p_holder_dni, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_holder_email, ''))), '');
begin
  select coalesce(sum(coalesce((value ->> 'quantity')::integer, 0)), 0)
    into v_requested
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));

  perform public.assert_holder_identity_ticket_cap(
    p_event_id,
    v_dni,
    v_email,
    v_requested
  );

  for v_row in
    select *
    from public.reserve_unified_cart_tx(
      p_event_id,
      p_owner_id,
      p_items,
      p_promoter_id
    )
  loop
    v_order := v_row.order_id;
    order_id := v_row.order_id;
    ticket_id := v_row.ticket_id;
    subtotal := v_row.subtotal;
    service_charge := v_row.service_charge;
    total_amount := v_row.total_amount;
    return next;
  end loop;

  if v_order is not null and (v_dni is not null or v_email is not null) then
    update public.tickets
    set
      holder_dni = coalesce(v_dni, holder_dni),
      holder_email = coalesce(v_email, holder_email),
      updated_at = now()
    where tickets.order_id = v_order
      and tickets.owner_id = p_owner_id;
  end if;
end;
$$;

revoke all on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  from public;
grant execute on function public.reserve_unified_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  to authenticated, service_role;

create or replace function public.claim_and_reserve_ga_cart_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid,
  p_holder_dni text,
  p_holder_email text
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_requested integer := 0;
  v_order uuid;
  v_row record;
  v_dni text := nullif(btrim(coalesce(p_holder_dni, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_holder_email, ''))), '');
begin
  select coalesce(sum(coalesce((value ->> 'quantity')::integer, 0)), 0)
    into v_requested
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));

  perform public.assert_holder_identity_ticket_cap(
    p_event_id,
    v_dni,
    v_email,
    v_requested
  );

  for v_row in
    select *
    from public.claim_and_reserve_ga_cart_tx(
      p_event_id,
      p_owner_id,
      p_items,
      p_promoter_id
    )
  loop
    v_order := v_row.order_id;
    order_id := v_row.order_id;
    ticket_id := v_row.ticket_id;
    subtotal := v_row.subtotal;
    service_charge := v_row.service_charge;
    total_amount := v_row.total_amount;
    return next;
  end loop;

  if v_order is not null and (v_dni is not null or v_email is not null) then
    update public.tickets
    set
      holder_dni = coalesce(v_dni, holder_dni),
      holder_email = coalesce(v_email, holder_email),
      updated_at = now()
    where tickets.order_id = v_order
      and tickets.owner_id = p_owner_id;
  end if;
end;
$$;

revoke all on function public.claim_and_reserve_ga_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  from public;
grant execute on function public.claim_and_reserve_ga_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  to authenticated, service_role;

create or replace function public.reserve_hybrid_cart_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid,
  p_holder_dni text,
  p_holder_email text
)
returns table (
  order_id uuid,
  ticket_id uuid,
  subtotal numeric,
  service_charge numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select *
  from public.reserve_unified_cart_tx(
    p_event_id,
    p_owner_id,
    public.normalize_checkout_cart_items(p_event_id, p_items),
    p_promoter_id,
    p_holder_dni,
    p_holder_email
  );
end;
$$;

revoke all on function public.reserve_hybrid_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  from public;
grant execute on function public.reserve_hybrid_cart_tx(uuid, uuid, jsonb, uuid, text, text)
  to authenticated, service_role;
