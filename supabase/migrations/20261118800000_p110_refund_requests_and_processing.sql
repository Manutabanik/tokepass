-- P110: Pedidos de arrepentimiento + estado refund_processing.
-- El QR se anula al aprobar; el money-move queda en la pasarela (TS).

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'pending',
      'paid',
      'failed',
      'expired',
      'refunded',
      'refund_processing'
    )
  );

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists refund_requests_user_idx
  on public.refund_requests (user_id, created_at desc);

create unique index if not exists refund_requests_open_order_uidx
  on public.refund_requests (order_id)
  where status in ('pending', 'approved');

comment on table public.refund_requests is
  'Solicitudes del Boton de Arrepentimiento. Auto-aprobadas si cumplen 10 dias y 24 h al evento.';

alter table public.refund_requests enable row level security;

revoke all on table public.refund_requests from public, anon;
grant select, insert on table public.refund_requests to authenticated;
grant all on table public.refund_requests to service_role;

drop policy if exists refund_requests_select_own on public.refund_requests;
create policy refund_requests_select_own
on public.refund_requests
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_super_admin())
);

drop policy if exists refund_requests_insert_own on public.refund_requests;
create policy refund_requests_insert_own
on public.refund_requests
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);

-- Marca la orden y anula QRs (valid + pending_payment). Resta stock de valid.
create or replace function public.apply_order_refund_state(
  p_order_id uuid,
  p_order_status text default 'refunded'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_tier_id uuid;
  v_count integer;
  v_total integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_order_id is null then
    return 0;
  end if;

  if p_order_status not in ('refunded', 'refund_processing') then
    raise exception 'INVALID_REFUND_STATUS' using errcode = '22023';
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
    and status in (
      'valid'::public.ticket_status,
      'pending_payment'::public.ticket_status
    );

  get diagnostics v_count = row_count;
  v_total := greatest(v_total, coalesce(v_count, 0));

  for v_tier_id, v_count in
    select ir.item_id, count(*)::integer
    from public.item_redemptions as ir
    where ir.order_id = p_order_id
      and ir.status in ('pending', 'valid')
    group by ir.item_id
  loop
    update public.event_items
    set stock = stock + v_count
    where id = v_tier_id;
  end loop;

  update public.item_redemptions
  set
    status = 'cancelled',
    updated_at = now()
  where order_id = p_order_id
    and status in ('pending', 'valid');

  update public.orders
  set
    status = p_order_status,
    updated_at = now()
  where id = p_order_id
    and status in ('paid', 'refund_processing');

  return v_total;
end;
$$;

revoke all on function public.apply_order_refund_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_order_refund_state(uuid, text)
  to service_role;
