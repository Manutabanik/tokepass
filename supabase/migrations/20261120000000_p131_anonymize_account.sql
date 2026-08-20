-- P131 · Anonimizacion de cuenta (Ley 25.326)
-- Conserva orders, total_amount, mp_payment_id y settlements.

create or replace function public.anonymize_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null then
    raise exception 'invalid_user' using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and auth.uid() is distinct from p_user_id
  then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.profiles
  set
    full_name = 'Usuario eliminado',
    email = 'deleted+' || p_user_id::text || '@invalid.tokepass',
    dni = null,
    phone = null,
    avatar_url = null,
    updated_at = now()
  where id = p_user_id;

  update public.tickets
  set
    holder_name = 'ANON',
    holder_email = 'deleted@invalid.tokepass',
    holder_dni = null
  where owner_id = p_user_id;

  update public.orders
  set customer_phone = null
  where buyer_id = p_user_id;
end;
$$;

revoke all on function public.anonymize_account(uuid) from public, anon;
grant execute on function public.anonymize_account(uuid)
  to authenticated, service_role;

comment on function public.anonymize_account(uuid) is
  'Ley 25.326: anonimiza PII del titular. No borra orders ni liquidaciones.';
