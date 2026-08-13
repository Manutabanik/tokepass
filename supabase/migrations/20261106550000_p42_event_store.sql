-- P42: Event Store — extras genéricos + compra standalone post-ticket
-- Conserva item_redemptions + stock FOR UPDATE; elimina legacy addons.

-- -----------------------------------------------------------------------------
-- 1) Drop legacy dead tables
-- -----------------------------------------------------------------------------
drop table if exists public.order_addons cascade;
drop table if exists public.addons cascade;

-- -----------------------------------------------------------------------------
-- 2) Categories + image on event_items
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.event_item_category as enum (
    'drinks',
    'food',
    'merch',
    'services',
    'upgrades'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.event_items
  add column if not exists image_url text;

alter table public.event_items
  add column if not exists category public.event_item_category
    not null default 'drinks'::public.event_item_category;

create index if not exists event_items_event_category_idx
  on public.event_items (event_id, category)
  where is_active = true;

comment on column public.event_items.category is
  'Taxonomía de la Tienda de Extras: drinks|food|merch|services|upgrades.';
comment on column public.event_items.image_url is
  'Imagen pública del producto (Storage).';

-- -----------------------------------------------------------------------------
-- 3) Standalone store order (requiere ticket válido previo del comprador)
-- -----------------------------------------------------------------------------
create or replace function public.create_store_order_tx(
  p_event_id uuid,
  p_owner_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_price numeric(12, 2);
  v_stock integer;
  v_active boolean;
  v_name text;
  v_item_event uuid;
  v_unit integer;
  v_items_total numeric(12, 2) := 0;
  v_token text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_event_id is null or p_owner_id is null then
    raise exception 'Datos incompletos' using errcode = '22023';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Seleccioná al menos un producto'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and e.status in (
        'published'::public.event_status,
        'draft'::public.event_status
      )
  ) then
    raise exception 'Evento no disponible' using errcode = 'P0002';
  end if;

  -- Solo quien ya tiene acceso al evento puede comprar extras standalone.
  if not exists (
    select 1
    from public.tickets as t
    where t.event_id = p_event_id
      and t.owner_id = p_owner_id
      and t.status in (
        'valid'::public.ticket_status,
        'used'::public.ticket_status,
        'scanned'::public.ticket_status
      )
  ) then
    raise exception 'STORE_REQUIRES_TICKET' using errcode = '42501';
  end if;

  insert into public.orders (
    buyer_id,
    subtotal,
    service_charge,
    total_amount,
    status,
    payment_method
  )
  values (
    p_owner_id,
    0,
    0,
    0,
    'pending',
    'mercadopago'
  )
  returning id into v_order_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_item_id := (v_item ->> 'item_id')::uuid;
    exception
      when others then
        raise exception 'item_id inválido' using errcode = '22P02';
    end;

    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_item_id is null or v_qty <= 0 then
      raise exception 'Cada ítem requiere item_id y quantity > 0'
        using errcode = '22023';
    end if;

    select ei.event_id, ei.price, ei.stock, ei.is_active, ei.name
      into v_item_event, v_price, v_stock, v_active, v_name
    from public.event_items as ei
    where ei.id = v_item_id
    for update;

    if not found then
      raise exception 'Producto no encontrado' using errcode = 'P0002';
    end if;

    if v_item_event is distinct from p_event_id then
      raise exception 'El producto no pertenece al evento'
        using errcode = '23514';
    end if;

    if coalesce(v_active, false) = false then
      raise exception 'Producto inactivo: %', v_name using errcode = '23514';
    end if;

    if v_stock < v_qty then
      raise exception 'Stock insuficiente: %', v_name using errcode = 'P0001';
    end if;

    update public.event_items
    set stock = stock - v_qty
    where id = v_item_id;

    for v_unit in 1..v_qty loop
      v_token := 'bar_' || replace(gen_random_uuid()::text, '-', '');

      insert into public.item_redemptions (
        order_id,
        item_id,
        user_id,
        qr_code_token,
        status
      )
      values (
        v_order_id,
        v_item_id,
        p_owner_id,
        v_token,
        'pending'
      );

      v_items_total := v_items_total + v_price;
    end loop;
  end loop;

  v_items_total := round(v_items_total, 2);

  if v_items_total <= 0 then
    raise exception 'El total de la tienda debe ser mayor a cero'
      using errcode = '23514';
  end if;

  update public.orders
  set
    subtotal = v_items_total,
    service_charge = 0,
    total_amount = v_items_total,
    updated_at = now()
  where id = v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.create_store_order_tx(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.create_store_order_tx(uuid, uuid, jsonb)
  to authenticated, service_role;

comment on function public.create_store_order_tx(uuid, uuid, jsonb) is
  'Orden solo-tienda: exige ticket válido previo; genera item_redemptions 1:1 con stock atómico.';

-- -----------------------------------------------------------------------------
-- 4) redeem_item: devolver imagen + categoría para UI de entrega
-- PostgreSQL no permite cambiar OUT/returns table con CREATE OR REPLACE.
-- -----------------------------------------------------------------------------
drop function if exists public.redeem_item(text, uuid);

create or replace function public.redeem_item(
  p_qr_token text,
  p_staff_user_id uuid
)
returns table (
  redemption_id uuid,
  item_name text,
  item_description text,
  item_image_url text,
  item_category text,
  redeemed_at timestamptz,
  already_redeemed boolean,
  previous_redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redemption public.item_redemptions%rowtype;
  v_item public.event_items%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_user_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_redemption
  from public.item_redemptions
  where qr_code_token = btrim(p_qr_token)
  for update;

  if not found then
    raise exception 'Canje no encontrado' using errcode = 'P0002';
  end if;

  select *
    into v_item
  from public.event_items
  where id = v_redemption.item_id;

  if not public.user_is_event_organizer_or_staff(
    v_item.event_id,
    p_staff_user_id,
    array['bar_staff'::public.event_staff_role]
  ) then
    raise exception 'Sin permiso de tienda para este evento'
      using errcode = '42501';
  end if;

  if v_redemption.status = 'redeemed' then
    return query
    select
      v_redemption.id,
      v_item.name,
      v_item.description,
      v_item.image_url,
      v_item.category::text,
      v_redemption.redeemed_at,
      true,
      v_redemption.redeemed_at;
    return;
  end if;

  if v_redemption.status = 'pending' then
    raise exception 'Producto aún no pagado' using errcode = '23514';
  end if;

  if v_redemption.status = 'cancelled' then
    raise exception 'Canje cancelado' using errcode = '23514';
  end if;

  if v_redemption.status <> 'valid' then
    raise exception 'Estado inválido' using errcode = '23514';
  end if;

  update public.item_redemptions
  set
    status = 'redeemed',
    redeemed_at = now(),
    redeemed_by = p_staff_user_id
  where id = v_redemption.id
  returning * into v_redemption;

  return query
  select
    v_redemption.id,
    v_item.name,
    v_item.description,
    v_item.image_url,
    v_item.category::text,
    v_redemption.redeemed_at,
    false,
    null::timestamptz;
end;
$$;

revoke all on function public.redeem_item(text, uuid) from public, anon;
grant execute on function public.redeem_item(text, uuid)
  to authenticated, service_role;
