-- P43: Hold TTL unificado (8m) + barrido de cron más agresivo
--
-- Política (alineada con lib/checkout-hold.ts y preferencia MP):
--   GA / pending genérico: 8 minutos desde orders.created_at
--   Seating:              8 minutos (reserved_until en reserve_seating_unit_tx)
-- Batch: 2500 por corrida (FOR UPDATE SKIP LOCKED / distinct holds).

-- -----------------------------------------------------------------------------
-- 1) expire_abandoned_orders — default 8m, limit 2500
-- -----------------------------------------------------------------------------
create or replace function public.expire_abandoned_orders(
  p_older_than interval default interval '8 minutes'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for v_order_id in
    select o.id
    from public.orders as o
    where o.status = 'pending'
      and o.created_at < (now() - p_older_than)
    order by o.created_at asc
    limit 2500
    for update skip locked
  loop
    if public.expire_abandoned_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_abandoned_orders(interval) from public;
revoke all on function public.expire_abandoned_orders(interval)
  from anon, authenticated;
grant execute on function public.expire_abandoned_orders(interval) to service_role;

comment on function public.expire_abandoned_orders(interval) is
  'Libera holds GA/pending tras p_older_than (default 8m). Batch 2500. Seating usa reserved_until (8m) vía expire_seating_orders.';

-- -----------------------------------------------------------------------------
-- 2) expire_seating_orders — mismo batch (TTL = reserved_until / 8m)
-- -----------------------------------------------------------------------------
create or replace function public.expire_seating_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- TTL = reserved_until (~8 min al reservar), alineado con GA.
  for v_order_id in
    select distinct u.reserved_order_id
    from public.event_seating_units as u
    where u.status = 'reserved'
      and u.reserved_until <= now()
      and u.reserved_order_id is not null
    limit 2500
  loop
    if public.expire_seating_order(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_seating_orders() from public;
revoke all on function public.expire_seating_orders()
  from anon, authenticated;
grant execute on function public.expire_seating_orders() to service_role;

comment on function public.expire_seating_orders() is
  'Libera holds de asientos numerados con reserved_until vencido (8m). Batch 2500.';
