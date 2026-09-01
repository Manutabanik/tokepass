-- P199 · Device binding de billetera
-- Un solo active_device_id por perfil. Login lo sobrescribe.
-- getMyTickets no entrega totp_secret si el device_id no coincide.
-- El JWT authenticated no puede UPDATE de esta columna (grants por columna).
-- Lectura/escritura del binding: solo RPCs SECURITY DEFINER.

alter table public.profiles
  add column if not exists active_device_id text;

comment on column public.profiles.active_device_id is
  'UUID del dispositivo que inició sesión por última vez. Solo esa huella recibe totp_secret.';

create or replace function public.claim_active_wallet_device(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  normalized := lower(trim(coalesce(p_device_id, '')));
  if normalized !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_device_id' using errcode = '22023';
  end if;

  update public.profiles
  set
    active_device_id = normalized,
    updated_at = now()
  where id = uid;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'device_id', normalized);
end;
$$;

create or replace function public.assert_active_wallet_device(p_device_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  stored text;
  normalized text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  normalized := lower(trim(coalesce(p_device_id, '')));
  if normalized !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'device_mismatch');
  end if;

  select p.active_device_id
    into stored
  from public.profiles as p
  where p.id = uid;

  if stored is null or lower(stored) is distinct from normalized then
    return jsonb_build_object('ok', false, 'error', 'device_mismatch');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.claim_active_wallet_device(text) from public;
revoke all on function public.assert_active_wallet_device(text) from public;
grant execute on function public.claim_active_wallet_device(text)
  to authenticated, service_role;
grant execute on function public.assert_active_wallet_device(text)
  to authenticated, service_role;

comment on function public.claim_active_wallet_device(text) is
  'Sobrescribe profiles.active_device_id con la huella del login actual.';
comment on function public.assert_active_wallet_device(text) is
  'True solo si p_device_id coincide con el dispositivo activo. No expone el valor guardado.';
