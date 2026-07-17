-- =============================================================================
-- Auth profile contingency
-- Garantiza un perfil customer por cada usuario creado en Supabase Auth.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role
  )
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    'customer'::public.user_role
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Repara usuarios históricos que hayan quedado sin perfil.
insert into public.profiles (id, email, full_name, role)
select
  users.id,
  coalesce(users.email, ''),
  nullif(users.raw_user_meta_data ->> 'full_name', ''),
  'customer'::public.user_role
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
where profiles.id is null
on conflict (id) do nothing;

-- Recuperación manual de una cuenta organizadora creada antes de esta migración:
-- update public.profiles
-- set role = 'admin'::public.user_role
-- where email = 'organizador@empresa.com';
