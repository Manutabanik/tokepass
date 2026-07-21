-- =============================================================================
-- Tokepass - Mercado Pago + rollback de reservas
-- =============================================================================

alter table public.orders
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text;

create index if not exists orders_mp_preference_id_idx
  on public.orders (mp_preference_id)
  where mp_preference_id is not null;

create index if not exists orders_mp_payment_id_idx
  on public.orders (mp_payment_id)
  where mp_payment_id is not null;

-- Permite al comprador actualizar columnas de tracking MP mientras la orden
-- sigue pendiente (sin poder marcarla como paid por sí mismo).
grant update (mp_preference_id, mp_payment_id, updated_at)
  on public.orders to authenticated;

-- -----------------------------------------------------------------------------
-- Rollback atómico de tickets reservados (si falla Mercado Pago)
-- -----------------------------------------------------------------------------

create or replace function public.release_reserved_tickets(p_ticket_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier_id uuid;
  v_count integer;
begin
  if p_ticket_ids is null or cardinality(p_ticket_ids) = 0 then
    return;
  end if;

  -- Solo el dueño de los tickets (o service_role) puede liberarlos.
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Forbidden' using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.tickets as t
      where t.id = any (p_ticket_ids)
        and t.owner_id <> auth.uid()
    ) then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
  end if;

  for v_tier_id, v_count in
    select t.tier_id, count(*)::integer
    from public.tickets as t
    where t.id = any (p_ticket_ids)
      and t.status = 'valid'::public.ticket_status
    group by t.tier_id
  loop
    update public.ticket_tiers
    set sold = greatest(0, sold - v_count)
    where id = v_tier_id;
  end loop;

  delete from public.tickets
  where id = any (p_ticket_ids)
    and status = 'valid'::public.ticket_status;
end;
$$;

revoke all on function public.release_reserved_tickets(uuid[]) from public;
revoke all on function public.release_reserved_tickets(uuid[]) from anon;
grant execute on function public.release_reserved_tickets(uuid[])
  to authenticated, service_role;
