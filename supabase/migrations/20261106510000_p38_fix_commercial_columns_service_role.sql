-- P38: Fix commercial-columns guard to recognize service_role via auth.role()
--
-- Bug: events_protect_commercial_columns() used `current_user <> 'service_role'`.
-- Under PostgREST, `current_user` is typically `authenticator` / pool role, while
-- the JWT role lives in auth.role(). The SuperAdmin Server Action correctly
-- authorizes in app code, then updates with createAdminClient() (service_role).
-- The trigger treated that as a non-service call, called is_super_admin() with
-- auth.uid() = null, and raised:
--   "Solo SuperAdmin puede modificar fees / sponsorship del evento"
--
-- Align with the rest of Tokepass (auth.role() = 'service_role').

create or replace function public.events_protect_commercial_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(auth.role(), '') is distinct from 'service_role'
     and not public.is_super_admin()
     and (
       new.platform_fee_percentage is distinct from old.platform_fee_percentage
       or new.platform_fixed_fee is distinct from old.platform_fixed_fee
       or new.max_free_tickets is distinct from old.max_free_tickets
       or new.is_sponsored_by_tokepass is distinct from old.is_sponsored_by_tokepass
     ) then
    raise exception 'Solo SuperAdmin puede modificar fees / sponsorship del evento'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.events_protect_commercial_columns() is
  'Bloquea mutación de fees/sponsorship salvo auth.role()=service_role o is_super_admin().';
