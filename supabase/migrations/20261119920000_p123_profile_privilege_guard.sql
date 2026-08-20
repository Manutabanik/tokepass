-- P123 · Guard de privilegio en profiles
-- role y organizer_approval_status solo los cambia service_role
-- (KYB Super Admin, promote de alta, governance). El JWT authenticated no puede.

create or replace function public.enforce_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (
       new.role is distinct from old.role
       or new.organizer_approval_status is distinct from old.organizer_approval_status
     )
     and coalesce(auth.role(), '') <> 'service_role'
  then
    raise exception
      'profiles.role y organizer_approval_status solo los puede cambiar service_role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_privilege_columns_guard on public.profiles;
create trigger profiles_privilege_columns_guard
  before update on public.profiles
  for each row
  execute function public.enforce_profile_privilege_columns();

comment on function public.enforce_profile_privilege_columns() is
  'Bloquea cambios de role / organizer_approval_status si auth.role() no es service_role.';
