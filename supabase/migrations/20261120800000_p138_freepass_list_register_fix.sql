-- =============================================================================
-- P138: FreePass / listas RRPP
-- - guest_lists.used_guests nunca existió; el RPC p4 leía esa columna y
--   rompía "Confirmar asistencia" con un error opaco.
-- - El cupo se calcula por conteo real de entradas.
-- - claim emite ticket para invitados (owner_id null + holder_email).
-- =============================================================================

alter table public.guest_lists
  add column if not exists used_guests integer not null default 0;

alter table public.guest_lists
  add column if not exists promoter_id uuid references public.promoters (id) on delete set null;

update public.guest_lists as gl
set used_guests = (
  select count(*)::integer
  from public.guest_list_entries as e
  where e.guest_list_id = gl.id
);

create or replace function public.ensure_freepass_tier(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.owns_event(p_event_id)
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select tt.id
    into v_tier_id
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and tt.name = 'Cortesía / FreePass'
  limit 1;

  if v_tier_id is not null then
    return v_tier_id;
  end if;

  insert into public.ticket_tiers (
    event_id,
    name,
    price,
    base_price,
    platform_fee,
    capacity,
    total_capacity,
    sold,
    visibility,
    layout_type,
    tier_type,
    category,
    admit_count,
    capacity_per_unit,
    bonus_reward
  )
  values (
    p_event_id,
    'Cortesía / FreePass',
    0,
    0,
    0,
    100000,
    100000,
    0,
    'private',
    'general',
    'addon',
    'special',
    1,
    1,
    'CORTESÍA / FREEPASS'
  )
  returning id into v_tier_id;

  return v_tier_id;
end;
$$;

create or replace function public.register_guest_list_entry(
  p_list_id uuid,
  p_full_name text default null,
  p_email text default null,
  p_phone text default null,
  p_client_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.guest_lists%rowtype;
  v_entry_id uuid;
  v_email text;
  v_phone text;
  v_used integer;
  v_bucket text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_list_id is null then
    raise exception 'Lista no encontrada' using errcode = 'P0002';
  end if;

  select *
    into v_list
  from public.guest_lists
  where id = p_list_id
  for update;

  if not found then
    raise exception 'Lista no encontrada' using errcode = 'P0002';
  end if;

  if v_list.valid_until < now() then
    raise exception 'El horario de esta lista ya venció' using errcode = '23514';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) < 2 then
    raise exception 'Nombre inválido' using errcode = '22023';
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_REQUIRED' using errcode = '22023';
  end if;

  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  if not public.consume_rate_limit(
    'guestlist:email:' || v_email,
    5,
    3600
  ) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  v_bucket := nullif(btrim(coalesce(p_client_key, '')), '');
  if v_bucket is not null then
    if not public.consume_rate_limit(
      'guestlist:client:' || p_list_id::text || ':' || v_bucket,
      8,
      900
    ) then
      raise exception 'RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1
    from public.guest_list_entries as e
    where e.guest_list_id = p_list_id
      and lower(e.email) = v_email
  ) then
    raise exception 'EMAIL_ALREADY_REGISTERED' using errcode = '23505';
  end if;

  select count(*)::integer
    into v_used
  from public.guest_list_entries as e
  where e.guest_list_id = p_list_id;

  if v_used >= v_list.max_guests then
    raise exception 'Lista completa: no quedan cupos' using errcode = 'P0001';
  end if;

  insert into public.guest_list_entries (
    guest_list_id,
    full_name,
    email,
    phone,
    status
  )
  values (
    p_list_id,
    btrim(p_full_name),
    v_email,
    v_phone,
    'pending'
  )
  returning id into v_entry_id;

  update public.guest_lists
  set used_guests = v_used + 1
  where id = p_list_id;

  return v_entry_id;
end;
$$;

drop function if exists public.register_guest_list_entry(uuid, text, text, text);
revoke all on function public.register_guest_list_entry(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_guest_list_entry(uuid, text, text, text, text)
  to service_role;

create or replace function public.claim_guest_list_entry(
  p_entry_id uuid,
  p_owner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.guest_list_entries%rowtype;
  v_list public.guest_lists%rowtype;
  v_tier_id uuid;
  v_ticket_id uuid;
  v_owner_id uuid;
  v_profile_email text;
  v_secret text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_owner_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_owner_id is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select *
    into v_entry
  from public.guest_list_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Entrada no encontrada' using errcode = 'P0002';
  end if;

  if v_entry.status = 'checked_in' then
    raise exception 'Esta cortesía ya fue usada en puerta' using errcode = '23514';
  end if;

  if v_entry.email is null or btrim(v_entry.email) = '' then
    raise exception 'EMAIL_REQUIRED' using errcode = '23514';
  end if;

  v_owner_id := p_owner_id;

  if v_owner_id is not null then
    select lower(p.email)
      into v_profile_email
    from public.profiles as p
    where p.id = v_owner_id;

    if v_profile_email is null
       or v_profile_email <> lower(btrim(v_entry.email)) then
      if coalesce(auth.role(), '') = 'service_role' then
        v_owner_id := null;
      else
        raise exception 'EMAIL_MISMATCH' using errcode = '23514';
      end if;
    end if;
  end if;

  if v_entry.status = 'claimed' and v_entry.ticket_id is not null then
    if v_owner_id is not null then
      update public.tickets
      set owner_id = coalesce(owner_id, v_owner_id)
      where id = v_entry.ticket_id;
    end if;
    return v_entry.ticket_id;
  end if;

  if v_entry.status <> 'pending' then
    raise exception 'La entrada no está disponible para canje' using errcode = '23514';
  end if;

  select *
    into v_list
  from public.guest_lists
  where id = v_entry.guest_list_id
  for update;

  if v_list.valid_until < now() then
    raise exception 'El horario de esta lista ya venció' using errcode = '23514';
  end if;

  v_tier_id := public.ensure_freepass_tier(v_list.event_id);

  update public.ticket_tiers
  set
    sold = sold + 1,
    capacity = greatest(capacity, sold + 1),
    total_capacity = greatest(total_capacity, sold + 1)
  where id = v_tier_id;

  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.tickets (
    event_id,
    tier_id,
    owner_id,
    qr_code,
    totp_secret,
    status,
    is_dynamic_qr,
    holder_name,
    holder_email,
    issuance_channel,
    max_admissions,
    admissions_used,
    ticket_type
  )
  values (
    v_list.event_id,
    v_tier_id,
    v_owner_id,
    'freepass-' || replace(gen_random_uuid()::text, '-', ''),
    v_secret,
    'valid'::public.ticket_status,
    false,
    btrim(v_entry.full_name),
    lower(btrim(v_entry.email)),
    'complimentary',
    1,
    0,
    'admission'::public.ticket_type
  )
  returning id into v_ticket_id;

  update public.guest_list_entries
  set
    status = 'claimed',
    ticket_id = v_ticket_id
  where id = p_entry_id;

  return v_ticket_id;
end;
$$;

revoke all on function public.claim_guest_list_entry(uuid, uuid) from public;
grant execute on function public.claim_guest_list_entry(uuid, uuid)
  to authenticated, service_role;
