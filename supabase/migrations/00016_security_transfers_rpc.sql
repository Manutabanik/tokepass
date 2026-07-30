-- =============================================================================
-- Tokepass · Seguridad (RPCs): transfer atómico, claim, anti-scalp, data migrate
-- Depende de 00015 (enums + columnas ya committed).
-- =============================================================================

update public.tickets
set status = 'used'::public.ticket_status
where status::text = 'scanned';

update public.tickets
set status = 'cancelled'::public.ticket_status
where status::text = 'revoked';

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
set search_path = ''
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
    select 1
    from public.profiles as p
    where p.id = v_sender
      and lower(p.email) = v_email
  ) then
    raise exception 'CANNOT_TRANSFER_TO_SELF' using errcode = '23514';
  end if;

  select p.id
    into v_receiver_id
  from public.profiles as p
  where lower(p.email) = v_email
  limit 1;

  select e.title
    into v_event_title
  from public.events as e
  where e.id = v_ticket.event_id;

  -- Invalidar QR del emisor; liberar asiento para el ticket nuevo (unique seat_id)
  update public.tickets
  set
    status = 'transferred'::public.ticket_status,
    seat_id = null,
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
    is_dynamic_qr,
    totp_secret,
    max_transfers_allowed,
    transfer_count
  )
  values (
    v_ticket.event_id,
    v_ticket.tier_id,
    v_receiver_id,
    'xfer_' || replace(gen_random_uuid()::text, '-', ''),
    'valid'::public.ticket_status,
    v_ticket.order_id,
    v_ticket.seat_id,
    coalesce(v_ticket.is_dynamic_qr, true),
    v_secret,
    v_ticket.max_transfers_allowed,
    v_ticket.transfer_count + 1
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

  return query
  select
    v_transfer_id,
    v_new_ticket_id,
    coalesce(v_event_title, 'Evento Tokepass'),
    v_email,
    v_receiver_id;
end;
$$;

revoke all on function public.execute_safe_transfer(uuid, text) from public;
grant execute on function public.execute_safe_transfer(uuid, text)
  to authenticated;

create or replace function public.claim_pending_ticket_transfers(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select lower(p.email)
    into v_email
  from public.profiles as p
  where p.id = p_user_id;

  if v_email is null then
    return 0;
  end if;

  update public.tickets as t
  set
    owner_id = p_user_id,
    updated_at = now()
  from public.ticket_transfers as tr
  where tr.new_ticket_id = t.id
    and t.owner_id is null
    and t.status = 'valid'::public.ticket_status
    and lower(tr.receiver_email) = v_email;

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.claim_pending_ticket_transfers(uuid) from public;
grant execute on function public.claim_pending_ticket_transfers(uuid)
  to authenticated, service_role;

create or replace function public.reserve_tickets_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb,
  p_promoter_id uuid default null
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
set search_path = ''
as $$
declare
  v_item jsonb;
  v_tier_id uuid;
  v_quantity integer;
  v_price numeric(12, 2);
  v_capacity integer;
  v_sold integer;
  v_tier_event_id uuid;
  v_organizer_id uuid;
  v_rate numeric(5, 4);
  v_subtotal numeric(12, 2) := 0;
  v_service_charge numeric(12, 2) := 0;
  v_total_amount numeric(12, 2) := 0;
  v_order_id uuid;
  v_ticket_ids uuid[] := '{}';
  v_i integer;
  v_one_id uuid;
  v_requested integer := 0;
  v_owned_valid integer := 0;
  v_max_per_user integer := 4;
  v_secret text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden'
      using errcode = '42501';
  end if;

  if p_event_id is null or p_owner_id is null then
    raise exception 'event_id y owner_id son obligatorios'
      using errcode = '22023';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Debés indicar al menos un ítem de compra'
      using errcode = '22023';
  end if;

  select e.organizer_id, coalesce(e.max_tickets_per_user, 4)
    into v_organizer_id, v_max_per_user
  from public.events as e
  where e.id = p_event_id
    and e.status = 'published'::public.event_status
  for update of e;

  if v_organizer_id is null then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select coalesce(sum(coalesce((value ->> 'quantity')::integer, 0)), 0)
    into v_requested
  from jsonb_array_elements(p_items);

  select count(*)::integer
    into v_owned_valid
  from public.tickets as t
  where t.event_id = p_event_id
    and t.owner_id = p_owner_id
    and t.status = 'valid'::public.ticket_status;

  if (v_owned_valid + v_requested) > v_max_per_user then
    raise exception 'MAX_TICKETS_PER_USER_EXCEEDED'
      using errcode = 'P0001';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  if p_promoter_id is not null then
    if not exists (
      select 1
      from public.promoters as pr
      where pr.id = p_promoter_id
        and pr.organizer_id = v_organizer_id
    ) then
      raise exception 'Promoter inválido para este evento'
        using errcode = '23514';
    end if;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_tier_id := (v_item ->> 'tier_id')::uuid;
    exception
      when others then
        raise exception 'tier_id inválido' using errcode = '22P02';
    end;

    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_tier_id is null or v_quantity <= 0 then
      raise exception 'Cada ítem requiere tier_id y quantity > 0'
        using errcode = '22023';
    end if;

    select tt.event_id, tt.price, tt.capacity, tt.sold
      into v_tier_event_id, v_price, v_capacity, v_sold
    from public.ticket_tiers as tt
    where tt.id = v_tier_id
    for update of tt;

    if not found then
      raise exception 'Ticket tier not found'
        using errcode = 'P0002';
    end if;

    if v_tier_event_id is distinct from p_event_id then
      raise exception 'El tier no pertenece al evento'
        using errcode = '23514';
    end if;

    if (v_capacity - v_sold) < v_quantity then
      raise exception 'Sold out'
        using errcode = 'P0001';
    end if;

    update public.ticket_tiers
    set sold = sold + v_quantity
    where id = v_tier_id;

    v_subtotal := v_subtotal + (v_price * v_quantity);

    for v_i in 1..v_quantity loop
      v_secret := encode(extensions.gen_random_bytes(24), 'hex');

      insert into public.tickets (
        event_id,
        tier_id,
        owner_id,
        qr_code,
        totp_secret
      )
      values (
        p_event_id,
        v_tier_id,
        p_owner_id,
        pg_catalog.gen_random_uuid()::text,
        v_secret
      )
      returning id into v_one_id;

      v_ticket_ids := array_append(v_ticket_ids, v_one_id);
    end loop;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_service_charge := round(v_subtotal * v_rate, 2);
  v_total_amount := round(v_subtotal + v_service_charge, 2);

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    promoter_id
  )
  values (
    p_owner_id,
    v_subtotal,
    v_service_charge,
    v_total_amount,
    'pending',
    p_promoter_id
  )
  returning id into v_order_id;

  update public.tickets
  set order_id = v_order_id
  where id = any (v_ticket_ids);

  return query
  select
    v_order_id,
    t.id,
    v_subtotal,
    v_service_charge,
    v_total_amount
  from unnest(v_ticket_ids) as t(id);
end;
$$;

comment on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) is
  'Reserva tickets con anti-scalp (max_tickets_per_user) y service charge.';

revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from public;
revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from anon;
grant execute on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;
