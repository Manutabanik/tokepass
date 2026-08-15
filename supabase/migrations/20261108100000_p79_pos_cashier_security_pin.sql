-- P79: PIN de seguridad de 4 digitos por cajero POS

alter table public.event_staff_assignments
  add column if not exists pos_security_pin_hash text;

comment on column public.event_staff_assignments.pos_security_pin_hash is
  'SHA-256 hex del PIN de 4 digitos del cajero POS.';

create or replace function public.pos_cashier_has_pin(p_event_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_event_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.event_staff_assignments as esa
    where esa.event_id = p_event_id
      and esa.user_id = v_uid
      and esa.role = 'cashier'
      and esa.is_active = true
      and (esa.expires_at is null or esa.expires_at > now())
      and esa.pos_security_pin_hash is not null
      and btrim(esa.pos_security_pin_hash) <> ''
  );
end;
$$;

revoke all on function public.pos_cashier_has_pin(uuid) from public;
grant execute on function public.pos_cashier_has_pin(uuid)
  to authenticated, service_role;

create or replace function public.set_pos_cashier_pin(
  p_assignment_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN_INVALID' using errcode = '22023';
  end if;

  select esa.event_id
    into v_event_id
  from public.event_staff_assignments as esa
  where esa.id = p_assignment_id
    and esa.role = 'cashier'
    and esa.is_active = true;

  if v_event_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.events e
    join public.profiles p on p.id = v_uid
    where e.id = v_event_id
      and (
        e.organizer_id = v_uid
        or p.role in ('admin', 'super_admin')
      )
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.event_staff_assignments
  set pos_security_pin_hash = public.hash_pos_supervisor_pin(p_pin)
  where id = p_assignment_id;

  return true;
end;
$$;

revoke all on function public.set_pos_cashier_pin(uuid, text) from public;
grant execute on function public.set_pos_cashier_pin(uuid, text)
  to authenticated, service_role;

create or replace function public.verify_pos_cashier_pin(
  p_event_id uuid,
  p_pin text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
begin
  if v_uid is null or p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return false;
  end if;

  select esa.pos_security_pin_hash
    into v_hash
  from public.event_staff_assignments as esa
  where esa.event_id = p_event_id
    and esa.user_id = v_uid
    and esa.role = 'cashier'
    and esa.is_active = true
    and (esa.expires_at is null or esa.expires_at > now())
  order by esa.created_at desc
  limit 1;

  if v_hash is null or btrim(v_hash) = '' then
    return false;
  end if;

  return v_hash = public.hash_pos_supervisor_pin(p_pin);
end;
$$;

revoke all on function public.verify_pos_cashier_pin(uuid, text) from public;
grant execute on function public.verify_pos_cashier_pin(uuid, text)
  to authenticated, service_role;

create or replace function public.bootstrap_pos_cashier_pin(
  p_event_id uuid,
  p_new_pin text,
  p_admin_pin text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_manager boolean := false;
  v_assignment_id uuid;
  v_hash text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN_INVALID' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.events e
    join public.profiles p on p.id = v_uid
    where e.id = p_event_id
      and (
        e.organizer_id = v_uid
        or p.role in ('admin', 'super_admin')
      )
  ) into v_is_manager;

  if not v_is_manager then
    if not public.verify_pos_supervisor_pin(p_event_id, p_admin_pin) then
      raise exception 'SUPERVISOR_PIN' using errcode = '42501';
    end if;
  end if;

  select esa.id, esa.pos_security_pin_hash
    into v_assignment_id, v_hash
  from public.event_staff_assignments as esa
  where esa.event_id = p_event_id
    and esa.user_id = v_uid
    and esa.role = 'cashier'
    and esa.is_active = true
    and (esa.expires_at is null or esa.expires_at > now())
  order by esa.created_at desc
  limit 1;

  if v_assignment_id is null then
    if v_is_manager then
      update public.events
      set
        pos_supervisor_pin_hash = public.hash_pos_supervisor_pin(p_new_pin),
        updated_at = now()
      where id = p_event_id;
      return true;
    end if;
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.event_staff_assignments
  set pos_security_pin_hash = public.hash_pos_supervisor_pin(p_new_pin)
  where id = v_assignment_id;

  return true;
end;
$$;

revoke all on function public.bootstrap_pos_cashier_pin(uuid, text, text) from public;
grant execute on function public.bootstrap_pos_cashier_pin(uuid, text, text)
  to authenticated, service_role;
