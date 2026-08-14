-- =============================================================================
-- Fase 2 · Column-Level Security (A2 ticket_tiers, A3 tickets)
-- 2026-08-14
--
-- authenticated no puede PATCH-ear precio/capacidad/sold ni status de tickets
-- vía PostgREST. Mutaciones financieras e inventario: service_role / RPC
-- SECURITY DEFINER (create_complete_event_*, update_complete_event_*,
-- scan_ticket_admission, reserve_*_tx).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privilegio total del backend
-- -----------------------------------------------------------------------------
grant all on table public.ticket_tiers to service_role;
grant all on table public.tickets to service_role;

-- -----------------------------------------------------------------------------
-- A2 · ticket_tiers — inmutabilidad financiera (price, capacity, sold, …)
-- -----------------------------------------------------------------------------
revoke update on table public.ticket_tiers from public;
revoke update on table public.ticket_tiers from anon;
revoke update on table public.ticket_tiers from authenticated;

-- Solo columnas no financieras/no inventario, si existen en el catálogo.
do $$
declare
  col text;
  allowed constant text[] := array[
    'name',
    'description',
    'visibility',
    'is_active',
    'max_per_order',
    'updated_at'
  ];
  present text[] := array[]::text[];
begin
  foreach col in array allowed loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ticket_tiers'
        and column_name = col
    ) then
      present := array_append(present, format('%I', col));
    end if;
  end loop;

  if cardinality(present) > 0 then
    execute format(
      'grant update (%s) on table public.ticket_tiers to authenticated',
      array_to_string(present, ', ')
    );
  end if;
end;
$$;

comment on table public.ticket_tiers is
  'price, base_price, platform_fee, capacity, sold y list_price no son UPDATE-ables por authenticated; usar RPC SECURITY DEFINER o service_role.';

-- -----------------------------------------------------------------------------
-- A3 · tickets — status / inventario de admisión solo vía RPC o service_role
-- -----------------------------------------------------------------------------
revoke update on table public.tickets from public;
revoke update on table public.tickets from anon;
revoke update on table public.tickets from authenticated;

-- El organizador no debe PATCH-ear status (used/revoked) fuera del escáner.
drop policy if exists "tickets_update_organized_event" on public.tickets;

-- scan_ticket_admission (P49) es SECURITY DEFINER: el dueño de la función
-- escribe status/admissions_used/scanned_at sin GRANT de authenticated.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'scan_ticket_admission'
      and p.prosecdef
  ) then
    null;
  else
    raise exception
      'scan_ticket_admission debe existir como SECURITY DEFINER antes del hardening A3'
      using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.scan_ticket_admission(uuid, uuid)
  to authenticated, service_role;

comment on table public.tickets is
  'authenticated no tiene UPDATE a nivel de tabla. Transiciones de status: scan_ticket_admission (SECURITY DEFINER) o service_role.';
