-- P183 · orders.status es text. El trigger de cupones no puede castear a
-- public.order_status (ese tipo nunca se creó). Sin esto, finalize sandbox/pago
-- explota: type "public.order_status" does not exist.

create or replace function public.orders_consume_promo_on_paid()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_promo public.promo_codes%rowtype;
begin
  if new.status = 'paid'
     and old.status is distinct from 'paid'
     and new.promo_code_id is not null
     and not coalesce(old.promo_usage_applied, false) then
    select *
      into v_promo
    from public.promo_codes as pc
    where pc.id = new.promo_code_id
    for update of pc;

    if not found then
      raise exception 'PROMO_NOT_FOUND'
        using errcode = 'P0002';
    end if;

    if v_promo.max_uses is not null
       and v_promo.current_uses >= v_promo.max_uses then
      raise exception 'PROMO_MAX_USES'
        using errcode = 'P0001',
          message = 'PROMO_MAX_USES: Este cupón agotó sus usos.';
    end if;

    update public.promo_codes
    set
      current_uses = current_uses + 1,
      updated_at = clock_timestamp()
    where id = v_promo.id;

    new.promo_usage_applied := true;
  end if;
  return new;
end;
$$;
