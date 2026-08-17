-- =============================================================================
-- P89 - RRPP commission snapshot on paid + POS void for door_staff
-- Al pasar orders.status a paid se congela promoter_id + comision
-- (porcentaje sobre subtotal o monto fijo por entrada).
-- =============================================================================

alter table public.promoters
  add column if not exists commission_type text not null default 'percent';

alter table public.promoters
  add column if not exists commission_fixed_amount numeric(12, 2);

alter table public.promoters
  drop constraint if exists promoters_commission_type_check;

alter table public.promoters
  add constraint promoters_commission_type_check
  check (commission_type in ('percent', 'fixed'));

comment on column public.promoters.commission_type is
  'percent = commission_rate sobre subtotal; fixed = commission_fixed_amount por entrada.';

alter table public.orders
  add column if not exists promoter_commission_amount numeric(12, 2);

alter table public.orders
  add column if not exists promoter_commission_type text;

comment on column public.orders.promoter_commission_amount is
  'Comision RRPP congelada al confirmar paid. Null si la orden no tiene promoter_id.';

create or replace function public.apply_promoter_commission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_type text;
  v_rate numeric;
  v_fixed numeric;
  v_tickets integer;
  v_amount numeric(12, 2);
begin
  if NEW.status::text is distinct from 'paid' then
    return NEW;
  end if;

  if NEW.promoter_id is null then
    NEW.promoter_commission_amount := null;
    NEW.promoter_commission_type := null;
    return NEW;
  end if;

  if TG_OP = 'UPDATE'
     and OLD.status::text = 'paid'
     and OLD.promoter_id is not distinct from NEW.promoter_id
     and NEW.promoter_commission_amount is not null then
    return NEW;
  end if;

  select
    coalesce(p.commission_type, 'percent'),
    coalesce(p.commission_rate, 0),
    coalesce(p.commission_fixed_amount, 0)
    into v_type, v_rate, v_fixed
  from public.promoters as p
  where p.id = NEW.promoter_id;

  if not found then
    NEW.promoter_commission_amount := null;
    NEW.promoter_commission_type := null;
    return NEW;
  end if;

  select count(*)::integer
    into v_tickets
  from public.tickets as t
  where t.order_id = NEW.id;

  if v_type = 'fixed' then
    v_amount := round(v_fixed * greatest(1, coalesce(v_tickets, 0)), 2);
  else
    v_type := 'percent';
    v_amount := round(
      coalesce(NEW.subtotal, 0) * greatest(0, least(1, v_rate)),
      2
    );
  end if;

  NEW.promoter_commission_amount := v_amount;
  NEW.promoter_commission_type := v_type;
  return NEW;
end;
$$;

drop trigger if exists orders_apply_promoter_commission on public.orders;
create trigger orders_apply_promoter_commission
  before insert or update of status, promoter_id, subtotal
  on public.orders
  for each row
  execute function public.apply_promoter_commission();

-- void_pos_order: mismo universo POS (cashier | door_staff | organizador)
-- y libera asientos/mesas vendidos en boleteria.
create or replace function public.void_pos_order(
  p_order_id uuid,
  p_supervisor_pin text
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_shift public.cashier_shifts%rowtype;
  v_event_id uuid;
  v_ticket_count integer;
  v_used_count integer;
  v_tier_id uuid;
  v_admit integer;
  v_units integer;
  v_tier_tickets integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_order
  from public.orders o
  where o.id = p_order_id
  for update of o;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'ORDER_NOT_VOIDABLE' using errcode = '23514';
  end if;

  if v_order.payment_method::text not in ('cash_pos', 'card_pos', 'transfer_pos') then
    raise exception 'NOT_POS_ORDER' using errcode = '23514';
  end if;

  if v_order.cashier_shift_id is null then
    raise exception 'SHIFT_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_shift
  from public.cashier_shifts s
  where s.id = v_order.cashier_shift_id
  for update of s;

  if not found or v_shift.status <> 'open' then
    raise exception 'SHIFT_INVALID' using errcode = '23514';
  end if;

  select t.event_id into v_event_id
  from public.tickets t
  where t.order_id = v_order.id
  limit 1;

  if v_event_id is null then
    raise exception 'ORDER_EMPTY' using errcode = 'P0002';
  end if;

  if not public.user_can_operate_pos(v_event_id, v_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not public.verify_pos_supervisor_pin(v_event_id, p_supervisor_pin) then
    raise exception 'SUPERVISOR_PIN_REQUIRED' using errcode = '42501';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where t.status::text in ('used', 'scanned')
         or coalesce(t.admissions_used, 0) > 0
    )::integer
    into v_ticket_count, v_used_count
  from public.tickets t
  where t.order_id = v_order.id;

  if coalesce(v_used_count, 0) > 0 then
    raise exception 'VOID_TICKETS_USED' using errcode = '23514';
  end if;

  update public.tickets
  set
    status = 'cancelled'::public.ticket_status,
    updated_at = now()
  where order_id = v_order.id
    and status = 'valid'::public.ticket_status;

  update public.event_seating_units
  set
    status = 'available',
    sold_order_id = null,
    reserved_by = null,
    reserved_order_id = null,
    reserved_until = null,
    updated_at = now()
  where sold_order_id = v_order.id
     or reserved_order_id = v_order.id;

  for v_tier_id, v_tier_tickets in
    select t.tier_id, count(*)::integer
    from public.tickets t
    where t.order_id = v_order.id
    group by t.tier_id
  loop
    select greatest(1, least(50, coalesce(tt.admit_count, 1)))
      into v_admit
    from public.ticket_tiers tt
    where tt.id = v_tier_id;

    v_units := greatest(1, (v_tier_tickets / greatest(v_admit, 1)));

    update public.ticket_tiers
    set sold = greatest(0, sold - v_units)
    where id = v_tier_id;
  end loop;

  update public.cashier_shifts
  set
    cash_sales_total = greatest(
      0,
      cash_sales_total
        - case
            when v_order.payment_method::text = 'cash_pos'
              then v_order.total_amount
            else 0
          end
    ),
    card_sales_total = greatest(
      0,
      card_sales_total
        - case
            when v_order.payment_method::text = 'card_pos'
              then v_order.total_amount
            else 0
          end
    ),
    transfer_sales_total = greatest(
      0,
      transfer_sales_total
        - case
            when v_order.payment_method::text = 'transfer_pos'
              then v_order.total_amount
            else 0
          end
    ),
    tickets_sold = greatest(0, tickets_sold - coalesce(v_ticket_count, 0)),
    updated_at = now()
  where id = v_shift.id;

  update public.orders
  set
    status = 'refunded',
    promoter_commission_amount = null,
    promoter_commission_type = null,
    updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.void_pos_order(uuid, text) from public;
grant execute on function public.void_pos_order(uuid, text)
  to authenticated, service_role;
