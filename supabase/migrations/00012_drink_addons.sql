-- =============================================================================
-- Tokepass · Pre-venta de Consumiciones / Add-ons de Barra
-- Nota: 00011 ya existe (guest_lists). Este archivo es 00012.
-- =============================================================================

create table if not exists public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  stock integer not null check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_items_event_name_key unique (event_id, name)
);

create table if not exists public.item_redemptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.event_items(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  qr_code_token text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'valid', 'redeemed', 'cancelled')),
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.item_redemptions.status is
  'pending=reservado en checkout; valid=pagado listo para barra; redeemed=entregado; cancelled=rollback';

create index if not exists event_items_event_id_idx
  on public.event_items (event_id);

create index if not exists event_items_event_active_idx
  on public.event_items (event_id, is_active)
  where is_active = true;

create index if not exists item_redemptions_order_id_idx
  on public.item_redemptions (order_id);

create index if not exists item_redemptions_user_id_idx
  on public.item_redemptions (user_id);

create index if not exists item_redemptions_qr_token_idx
  on public.item_redemptions (qr_code_token);

create index if not exists item_redemptions_status_idx
  on public.item_redemptions (status);

create trigger event_items_set_updated_at
before update on public.event_items
for each row execute function public.set_updated_at();

create trigger item_redemptions_set_updated_at
before update on public.item_redemptions
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.event_items enable row level security;
alter table public.item_redemptions enable row level security;

create policy "event_items_select_public_active"
on public.event_items
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.events as e
    where e.id = event_items.event_id
      and e.status in (
        'published'::public.event_status,
        'draft'::public.event_status
      )
  )
);

create policy "event_items_manage_owner_or_super_admin"
on public.event_items
for all
to authenticated
using (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
)
with check (
  (select public.owns_event(event_id))
  or (select public.is_super_admin())
);

create policy "item_redemptions_select_own_or_staff"
on public.item_redemptions
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_super_admin())
  or exists (
    select 1
    from public.event_items as ei
    join public.events as e on e.id = ei.event_id
    where ei.id = item_redemptions.item_id
      and e.organizer_id = (select auth.uid())
  )
);

create policy "item_redemptions_update_staff"
on public.item_redemptions
for update
to authenticated
using (
  (select public.is_super_admin())
  or exists (
    select 1
    from public.event_items as ei
    join public.events as e on e.id = ei.event_id
    where ei.id = item_redemptions.item_id
      and e.organizer_id = (select auth.uid())
  )
)
with check (
  (select public.is_super_admin())
  or exists (
    select 1
    from public.event_items as ei
    join public.events as e on e.id = ei.event_id
    where ei.id = item_redemptions.item_id
      and e.organizer_id = (select auth.uid())
  )
);

-- -----------------------------------------------------------------------------
-- Adjuntar consumiciones a una orden pending (anti-overbooking de stock)
-- -----------------------------------------------------------------------------

create or replace function public.attach_event_items_to_order(
  p_order_id uuid,
  p_owner_id uuid,
  p_items jsonb
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_event_id uuid;
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

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    return 0;
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada' using errcode = 'P0002';
  end if;

  if v_order.buyer_id is distinct from p_owner_id then
    raise exception 'Orden ajena' using errcode = '42501';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'La orden no admite consumiciones' using errcode = '23514';
  end if;

  select t.event_id
    into v_event_id
  from public.tickets as t
  where t.order_id = p_order_id
  limit 1;

  if v_event_id is null then
    raise exception 'La orden no tiene tickets asociados' using errcode = '23514';
  end if;

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

    if v_item_event is distinct from v_event_id then
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
        p_order_id,
        v_item_id,
        p_owner_id,
        v_token,
        'pending'
      );

      v_items_total := v_items_total + v_price;
    end loop;
  end loop;

  v_items_total := round(v_items_total, 2);

  update public.orders
  set
    subtotal = round(subtotal + v_items_total, 2),
    total_amount = round(total_amount + v_items_total, 2)
  where id = p_order_id;

  return v_items_total;
end;
$$;

revoke all on function public.attach_event_items_to_order(uuid, uuid, jsonb) from public;
grant execute on function public.attach_event_items_to_order(uuid, uuid, jsonb)
  to authenticated, service_role;

-- Rollback de consumiciones pendientes (falla MP)
create or replace function public.release_order_event_items(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
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

revoke all on function public.release_order_event_items(uuid) from public;
grant execute on function public.release_order_event_items(uuid)
  to authenticated, service_role;

-- Activar al pagar
create or replace function public.activate_order_item_redemptions(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.item_redemptions
  set status = 'valid'
  where order_id = p_order_id
    and status = 'pending';

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.activate_order_item_redemptions(uuid) from public;
grant execute on function public.activate_order_item_redemptions(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Canje atómico en barra
-- -----------------------------------------------------------------------------

create or replace function public.redeem_item(
  p_qr_token text,
  p_staff_user_id uuid
)
returns table (
  redemption_id uuid,
  item_name text,
  item_description text,
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
  v_organizer uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_staff_user_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_qr_token, '')), '') is null then
    raise exception 'Token vacío' using errcode = '22023';
  end if;

  select *
    into v_redemption
  from public.item_redemptions
  where qr_code_token = btrim(p_qr_token)
  for update;

  if not found then
    raise exception 'Consumición no encontrada' using errcode = 'P0002';
  end if;

  select *
    into v_item
  from public.event_items
  where id = v_redemption.item_id;

  select e.organizer_id
    into v_organizer
  from public.events as e
  where e.id = v_item.event_id;

  if coalesce(auth.role(), '') <> 'service_role'
     and v_organizer is distinct from p_staff_user_id
     and not public.is_super_admin() then
    raise exception 'Sin permiso de barra para este evento'
      using errcode = '42501';
  end if;

  if v_redemption.status = 'redeemed' then
    return query
    select
      v_redemption.id,
      v_item.name,
      v_item.description,
      v_redemption.redeemed_at,
      true,
      v_redemption.redeemed_at;
    return;
  end if;

  if v_redemption.status = 'pending' then
    raise exception 'Consumición aún no pagada' using errcode = '23514';
  end if;

  if v_redemption.status = 'cancelled' then
    raise exception 'Consumición cancelada' using errcode = '23514';
  end if;

  if v_redemption.status <> 'valid' then
    raise exception 'Estado inválido' using errcode = '23514';
  end if;

  update public.item_redemptions
  set
    status = 'redeemed',
    redeemed_at = now(),
    redeemed_by = p_staff_user_id
  where id = v_redemption.id;

  return query
  select
    v_redemption.id,
    v_item.name,
    v_item.description,
    now(),
    false,
    null::timestamptz;
end;
$$;

revoke all on function public.redeem_item(text, uuid) from public;
grant execute on function public.redeem_item(text, uuid)
  to authenticated, service_role;
