-- P191: process_pos_checkout_tx must refuse extras even when called
-- directly. P189 added assert_pos_admission_tier; createPosSale already
-- calls it. Cashiers (or a forged RPC) could still skip that and sell a
-- ticket_type=extra / tier_type=addon row as admission.
--
-- Rename the P176 body and wrap it. Do not copy the 400-line checkout.

do $$
begin
  if to_regprocedure(
       'public.process_pos_checkout_tx_ungated(uuid,uuid,integer,text,uuid,text,text,text,uuid,text,uuid,text,uuid)'
     ) is null
     and to_regprocedure(
       'public.process_pos_checkout_tx(uuid,uuid,integer,text,uuid,text,text,text,uuid,text,uuid,text,uuid)'
     ) is not null
  then
    alter function public.process_pos_checkout_tx(
      uuid,
      uuid,
      integer,
      text,
      uuid,
      text,
      text,
      text,
      uuid,
      text,
      uuid,
      text,
      uuid
    ) rename to process_pos_checkout_tx_ungated;
  end if;
end
$$;

create or replace function public.process_pos_checkout_tx(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_payment_method text,
  p_cashier_user_id uuid,
  p_customer_phone text default null,
  p_customer_dni text default null,
  p_customer_name text default null,
  p_shift_id uuid default null,
  p_supervisor_pin text default null,
  p_seating_unit_id uuid default null,
  p_seating_layout_item_id text default null,
  p_event_date_id uuid default null
)
returns table (
  order_id uuid,
  ticket_id uuid,
  totp_secret text,
  qr_code text,
  unit_price numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  perform public.assert_pos_admission_tier(p_event_id, p_tier_id);
  return query
  select *
  from public.process_pos_checkout_tx_ungated(
    p_event_id,
    p_tier_id,
    p_quantity,
    p_payment_method,
    p_cashier_user_id,
    p_customer_phone,
    p_customer_dni,
    p_customer_name,
    p_shift_id,
    p_supervisor_pin,
    p_seating_unit_id,
    p_seating_layout_item_id,
    p_event_date_id
  );
end;
$$;

revoke all on function public.process_pos_checkout_tx_ungated(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.process_pos_checkout_tx_ungated(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text, uuid
) to service_role;

revoke all on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text, uuid
) from public, anon;
grant execute on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text, uuid
) to authenticated, service_role;

comment on function public.process_pos_checkout_tx(
  uuid, uuid, integer, text, uuid, text, text, text, uuid, text, uuid, text, uuid
) is
  'POS checkout. Refuses extras (P191) then runs the P176 lock/sale body.';
