-- =============================================================================
-- P7 - Make pgcrypto available to hardened SECURITY DEFINER functions
-- =============================================================================

create schema if not exists extensions;

do $$
declare
  v_schema text;
begin
  select n.nspname
  into v_schema
  from pg_catalog.pg_extension as e
  join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_schema is null then
    create extension pgcrypto with schema extensions;
  elsif v_schema <> 'extensions' then
    alter extension pgcrypto set schema extensions;
  end if;
end;
$$;

-- These functions intentionally use a restricted search_path. pg_catalog is
-- trusted and extensions contains the Supabase-managed pgcrypto functions.
alter function public.reserve_tickets_tx(uuid, uuid, jsonb, uuid)
  set search_path = pg_catalog, extensions;

alter function public.execute_safe_transfer(uuid, text)
  set search_path = pg_catalog, extensions;

alter function public.create_pos_sale_tx(uuid, uuid, integer, text, uuid, text)
  set search_path = pg_catalog, extensions;
