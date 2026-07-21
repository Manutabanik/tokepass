-- =============================================================================
-- Tokepass · Service Charge (cargo por servicio dinámico por organizador)
-- Nota: 00009 ya existe (RRPP). Este archivo es 00010.
-- Los "organizadores" viven en public.profiles (role = admin | super_admin).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Rate por productora + desglose en órdenes
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists service_charge_rate numeric(5, 4);

update public.profiles
set service_charge_rate = 0.15
where service_charge_rate is null;

alter table public.profiles
  alter column service_charge_rate set default 0.15,
  alter column service_charge_rate set not null;

alter table public.profiles
  drop constraint if exists profiles_service_charge_rate_check;

alter table public.profiles
  add constraint profiles_service_charge_rate_check
  check (service_charge_rate >= 0 and service_charge_rate <= 1);

comment on column public.profiles.service_charge_rate is
  'Fracción decimal cobrada al comprador sobre el subtotal (0.15 = 15%).';

alter table public.orders
  add column if not exists subtotal numeric(12, 2),
  add column if not exists service_charge numeric(12, 2);

-- Backfill: órdenes legacy → todo el total era "tickets" (sin cargo registrado)
update public.orders
set
  subtotal = coalesce(subtotal, total_amount),
  service_charge = coalesce(service_charge, 0)
where subtotal is null
   or service_charge is null;

alter table public.orders
  alter column subtotal set default 0,
  alter column service_charge set default 0,
  alter column subtotal set not null,
  alter column service_charge set not null;

alter table public.orders
  drop constraint if exists orders_subtotal_check;

alter table public.orders
  add constraint orders_subtotal_check
  check (subtotal >= 0);

alter table public.orders
  drop constraint if exists orders_service_charge_check;

alter table public.orders
  add constraint orders_service_charge_check
  check (service_charge >= 0);

comment on column public.orders.subtotal is
  'Costo de tickets (antes del cargo por servicio).';
comment on column public.orders.service_charge is
  'Ganancia de la plataforma Tokepass (service fee).';
comment on column public.orders.total_amount is
  'subtotal + service_charge (monto cobrado en la pasarela).';

-- Columnas editables por service role / flujos internos
grant update (subtotal, service_charge, total_amount, status, promoter_id, mp_preference_id, mp_payment_id)
  on public.orders to authenticated;

-- -----------------------------------------------------------------------------
-- 2) RPC atómico: reserva + orden con desglose de precios
-- -----------------------------------------------------------------------------

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

  select e.organizer_id
    into v_organizer_id
  from public.events as e
  where e.id = p_event_id
    and e.status = 'published'::public.event_status
  for update of e;

  if v_organizer_id is null then
    raise exception 'Evento no encontrado o no publicado'
      using errcode = 'P0002';
  end if;

  select coalesce(p.service_charge_rate, 0.15)
    into v_rate
  from public.profiles as p
  where p.id = v_organizer_id;

  if v_rate is null then
    v_rate := 0.15;
  end if;

  -- Validar promoter (si viene) pertenece al organizador del evento
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
      insert into public.tickets (
        event_id,
        tier_id,
        owner_id,
        qr_code
      )
      values (
        p_event_id,
        v_tier_id,
        p_owner_id,
        pg_catalog.gen_random_uuid()::text
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
  'Reserva tickets y crea la orden pending con subtotal + service_charge + total.';

revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from public;
revoke all on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid) from anon;
grant execute on function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;

-- Helper público (security definer) para mostrar el rate en el checkout UI
create or replace function public.get_event_service_charge_rate(p_event_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.service_charge_rate, 0.15)
  from public.events as e
  join public.profiles as p on p.id = e.organizer_id
  where e.id = p_event_id;
$$;

revoke all on function public.get_event_service_charge_rate(uuid) from public;
grant execute on function public.get_event_service_charge_rate(uuid)
  to anon, authenticated, service_role;
