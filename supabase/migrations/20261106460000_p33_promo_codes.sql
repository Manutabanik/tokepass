-- =============================================================================
-- P33 · Motor de Cupones / Promo Codes
-- Validación pública vía RPC; escritura solo organizador del evento.
-- Aplicación atómica en checkout (+1 current_uses); release al expirar orden.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'promo_discount_type' and n.nspname = 'public'
  ) then
    create type public.promo_discount_type as enum ('percentage', 'fixed_amount');
  end if;
end $$;

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code varchar(40) not null,
  discount_type public.promo_discount_type not null,
  discount_value numeric(12, 2) not null check (discount_value > 0),
  max_uses integer null check (max_uses is null or max_uses > 0),
  current_uses integer not null default 0 check (current_uses >= 0),
  valid_until timestamptz null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_codes_percentage_range_check
    check (
      discount_type <> 'percentage'
      or (discount_value > 0 and discount_value <= 100)
    ),
  constraint promo_codes_uses_cap_check
    check (max_uses is null or current_uses <= max_uses)
);

create unique index if not exists promo_codes_event_code_uidx
  on public.promo_codes (event_id, upper(code));

create index if not exists promo_codes_event_active_idx
  on public.promo_codes (event_id, is_active);

comment on table public.promo_codes is
  'Cupones por evento: % o monto fijo. Usos contados atómicamente en checkout.';

alter table public.orders
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;

alter table public.orders
  add column if not exists discount_amount numeric(12, 2) not null default 0
    check (discount_amount >= 0);

create index if not exists orders_promo_code_id_idx
  on public.orders (promo_code_id)
  where promo_code_id is not null;

-- updated_at trigger (reuse generic if present)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at' and n.nspname = 'public'
  ) then
    drop trigger if exists promo_codes_set_updated_at on public.promo_codes;
    create trigger promo_codes_set_updated_at
    before update on public.promo_codes
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.promo_codes enable row level security;

drop policy if exists "promo_codes_select_owner_or_super_admin" on public.promo_codes;
drop policy if exists "promo_codes_insert_owner_or_super_admin" on public.promo_codes;
drop policy if exists "promo_codes_update_owner_or_super_admin" on public.promo_codes;
drop policy if exists "promo_codes_delete_owner_or_super_admin" on public.promo_codes;

-- Lectura directa de filas: solo organizador (el público valida vía RPC).
create policy "promo_codes_select_owner_or_super_admin"
on public.promo_codes
for select
to authenticated
using (
  exists (
    select 1
    from public.events as e
    left join public.profiles as p on p.id = (select auth.uid())
    where e.id = promo_codes.event_id
      and (
        e.organizer_id = (select auth.uid())
        or p.role::text = 'super_admin'
      )
  )
);

create policy "promo_codes_insert_owner_or_super_admin"
on public.promo_codes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.events as e
    left join public.profiles as p on p.id = (select auth.uid())
    where e.id = promo_codes.event_id
      and (
        e.organizer_id = (select auth.uid())
        or p.role::text = 'super_admin'
      )
  )
);

create policy "promo_codes_update_owner_or_super_admin"
on public.promo_codes
for update
to authenticated
using (
  exists (
    select 1
    from public.events as e
    left join public.profiles as p on p.id = (select auth.uid())
    where e.id = promo_codes.event_id
      and (
        e.organizer_id = (select auth.uid())
        or p.role::text = 'super_admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.events as e
    left join public.profiles as p on p.id = (select auth.uid())
    where e.id = promo_codes.event_id
      and (
        e.organizer_id = (select auth.uid())
        or p.role::text = 'super_admin'
      )
  )
);

create policy "promo_codes_delete_owner_or_super_admin"
on public.promo_codes
for delete
to authenticated
using (
  exists (
    select 1
    from public.events as e
    left join public.profiles as p on p.id = (select auth.uid())
    where e.id = promo_codes.event_id
      and (
        e.organizer_id = (select auth.uid())
        or p.role::text = 'super_admin'
      )
  )
);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.compute_promo_discount(
  p_discount_type public.promo_discount_type,
  p_discount_value numeric,
  p_base_amount numeric
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_base numeric(12, 2) := greatest(0, round(coalesce(p_base_amount, 0), 2));
  v_discount numeric(12, 2);
begin
  if v_base <= 0 then
    return 0;
  end if;

  if p_discount_type = 'percentage' then
    v_discount := round(v_base * (p_discount_value / 100.0), 2);
  else
    v_discount := round(p_discount_value, 2);
  end if;

  return least(v_base, greatest(0, v_discount));
end;
$$;

-- Validación para UI B2C (no incrementa usos).
create or replace function public.validate_promo_code(
  p_event_id uuid,
  p_code text,
  p_cart_subtotal numeric default 0
)
returns table (
  ok boolean,
  promo_code_id uuid,
  code text,
  discount_type public.promo_discount_type,
  discount_value numeric,
  discount_amount numeric,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promo public.promo_codes%rowtype;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_discount numeric(12, 2);
begin
  if p_event_id is null or v_code = '' then
    return query select false, null::uuid, null::text, null::public.promo_discount_type,
      null::numeric, 0::numeric, 'Ingresá un código válido.'::text;
    return;
  end if;

  select *
    into v_promo
  from public.promo_codes as pc
  where pc.event_id = p_event_id
    and upper(pc.code) = v_code
  limit 1;

  if not found then
    return query select false, null::uuid, null::text, null::public.promo_discount_type,
      null::numeric, 0::numeric, 'Código no válido para este evento.'::text;
    return;
  end if;

  if not v_promo.is_active then
    return query select false, v_promo.id, v_promo.code, v_promo.discount_type,
      v_promo.discount_value, 0::numeric, 'Este cupón está inactivo.'::text;
    return;
  end if;

  if v_promo.valid_until is not null and v_promo.valid_until < now() then
    return query select false, v_promo.id, v_promo.code, v_promo.discount_type,
      v_promo.discount_value, 0::numeric, 'Este cupón ya venció.'::text;
    return;
  end if;

  if v_promo.max_uses is not null and v_promo.current_uses >= v_promo.max_uses then
    return query select false, v_promo.id, v_promo.code, v_promo.discount_type,
      v_promo.discount_value, 0::numeric, 'Este cupón agotó sus usos.'::text;
    return;
  end if;

  v_discount := public.compute_promo_discount(
    v_promo.discount_type,
    v_promo.discount_value,
    p_cart_subtotal
  );

  if v_discount <= 0 then
    return query select false, v_promo.id, v_promo.code, v_promo.discount_type,
      v_promo.discount_value, 0::numeric, 'El carrito no admite descuento.'::text;
    return;
  end if;

  return query select true, v_promo.id, v_promo.code, v_promo.discount_type,
    v_promo.discount_value, v_discount, 'Cupón aplicado.'::text;
end;
$$;

revoke all on function public.validate_promo_code(uuid, text, numeric) from public;
grant execute on function public.validate_promo_code(uuid, text, numeric)
  to anon, authenticated;

-- Aplica cupón a orden pending: revalida, ajusta montos, +1 uso.
create or replace function public.apply_promo_code_to_order(
  p_order_id uuid,
  p_owner_id uuid,
  p_promo_code_id uuid
)
returns table (
  ok boolean,
  discount_amount numeric,
  total_amount numeric,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_promo public.promo_codes%rowtype;
  v_ticket_event uuid;
  v_discount numeric(12, 2);
  v_new_subtotal numeric(12, 2);
  v_new_total numeric(12, 2);
  v_new_service numeric(12, 2);
begin
  if p_order_id is null or p_owner_id is null or p_promo_code_id is null then
    return query select false, 0::numeric, 0::numeric, 'Datos de cupón incompletos.'::text;
    return;
  end if;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return query select false, 0::numeric, 0::numeric, 'Orden no encontrada.'::text;
    return;
  end if;

  if v_order.buyer_id is distinct from p_owner_id then
    return query select false, 0::numeric, 0::numeric, 'No podés modificar esta orden.'::text;
    return;
  end if;

  if v_order.status is distinct from 'pending' then
    return query select false, 0::numeric, 0::numeric, 'La orden ya no admite cupones.'::text;
    return;
  end if;

  if v_order.promo_code_id is not null then
    return query select false, coalesce(v_order.discount_amount, 0), v_order.total_amount,
      'La orden ya tiene un cupón aplicado.'::text;
    return;
  end if;

  select t.event_id
    into v_ticket_event
  from public.tickets as t
  where t.order_id = p_order_id
  limit 1;

  select *
    into v_promo
  from public.promo_codes as pc
  where pc.id = p_promo_code_id
  for update of pc;

  if not found then
    return query select false, 0::numeric, v_order.total_amount, 'Cupón no encontrado.'::text;
    return;
  end if;

  if v_ticket_event is null or v_promo.event_id is distinct from v_ticket_event then
    return query select false, 0::numeric, v_order.total_amount, 'Cupón inválido para este evento.'::text;
    return;
  end if;

  if not v_promo.is_active then
    return query select false, 0::numeric, v_order.total_amount, 'Este cupón está inactivo.'::text;
    return;
  end if;

  if v_promo.valid_until is not null and v_promo.valid_until < now() then
    return query select false, 0::numeric, v_order.total_amount, 'Este cupón ya venció.'::text;
    return;
  end if;

  if v_promo.max_uses is not null and v_promo.current_uses >= v_promo.max_uses then
    return query select false, 0::numeric, v_order.total_amount, 'Este cupón agotó sus usos.'::text;
    return;
  end if;

  v_discount := public.compute_promo_discount(
    v_promo.discount_type,
    v_promo.discount_value,
    v_order.subtotal
  );

  if v_discount <= 0 then
    return query select false, 0::numeric, v_order.total_amount, 'El carrito no admite descuento.'::text;
    return;
  end if;

  v_new_subtotal := greatest(0, round(v_order.subtotal - v_discount, 2));
  v_new_total := greatest(0, round(v_order.total_amount - v_discount, 2));
  v_new_service := least(coalesce(v_order.service_charge, 0), v_new_total);

  update public.orders
  set
    promo_code_id = v_promo.id,
    discount_amount = v_discount,
    subtotal = v_new_subtotal,
    service_charge = v_new_service,
    total_amount = v_new_total,
    updated_at = now()
  where id = p_order_id;

  update public.promo_codes
  set
    current_uses = current_uses + 1,
    updated_at = now()
  where id = v_promo.id;

  return query select true, v_discount, v_new_total, 'Cupón aplicado.'::text;
end;
$$;

revoke all on function public.apply_promo_code_to_order(uuid, uuid, uuid) from public;
grant execute on function public.apply_promo_code_to_order(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function public.release_order_promo_code(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return;
  end if;

  if v_order.promo_code_id is null then
    return;
  end if;

  -- Solo liberar usos de órdenes no pagadas.
  if v_order.status = 'paid' then
    return;
  end if;

  update public.promo_codes
  set
    current_uses = greatest(0, current_uses - 1),
    updated_at = now()
  where id = v_order.promo_code_id;

  update public.orders
  set
    promo_code_id = null,
    discount_amount = 0,
    updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.release_order_promo_code(uuid) from public;
grant execute on function public.release_order_promo_code(uuid) to service_role;

-- Patch: liberar cupón al expirar orden abandonada.
create or replace function public.expire_abandoned_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_tier_id uuid;
  v_count integer;
begin
  if p_order_id is null then
    return false;
  end if;

  select *
    into v_order
  from public.orders as o
  where o.id = p_order_id
  for update of o;

  if not found then
    return false;
  end if;

  if v_order.status is distinct from 'pending' then
    return false;
  end if;

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
  set
    status = 'cancelled'::public.ticket_status,
    updated_at = now()
  where order_id = p_order_id
    and status = 'pending_payment'::public.ticket_status;

  begin
    perform public.release_order_event_items(p_order_id);
  exception
    when undefined_function then
      null;
  end;

  begin
    perform public.release_order_promo_code(p_order_id);
  exception
    when undefined_function then
      null;
  end;

  update public.orders
  set
    status = 'expired',
    updated_at = now()
  where id = p_order_id
    and status = 'pending';

  return true;
end;
$$;
