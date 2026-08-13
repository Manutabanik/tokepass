-- =============================================================================
-- P39: KYB organizer_applications + progressive profiling (phone on profiles)
-- Identidades separadas: B2C (customer) vs B2B (admin aprobado vía KYB).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Enum de solicitudes KYB
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'organizer_application_status'
  ) then
    create type public.organizer_application_status as enum (
      'pending',
      'approved',
      'rejected'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2) Progressive profiling: teléfono en profiles
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists phone text;

comment on column public.profiles.phone is
  'Teléfono / WhatsApp del comprador (progressive profiling en checkout).';

-- -----------------------------------------------------------------------------
-- 3) Tabla organizer_applications (1 solicitud activa por usuario = PK)
-- -----------------------------------------------------------------------------
create table if not exists public.organizer_applications (
  id uuid primary key references auth.users (id) on delete cascade,
  company_name varchar(160) not null,
  cuit_cuil varchar(20) not null,
  responsible_dni varchar(20) not null,
  cbu_alias varchar(80) not null,
  social_media_url varchar(500) not null,
  status public.organizer_application_status not null default 'pending',
  review_notes text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_applications_company_name_len
    check (char_length(btrim(company_name)) >= 2),
  constraint organizer_applications_cuit_len
    check (char_length(regexp_replace(cuit_cuil, '\D', '', 'g')) between 10 and 13),
  constraint organizer_applications_dni_len
    check (char_length(regexp_replace(responsible_dni, '\D', '', 'g')) between 7 and 10),
  constraint organizer_applications_cbu_len
    check (char_length(btrim(cbu_alias)) >= 6),
  constraint organizer_applications_social_len
    check (char_length(btrim(social_media_url)) >= 8)
);

create index if not exists organizer_applications_status_idx
  on public.organizer_applications (status, created_at desc);

comment on table public.organizer_applications is
  'Pipeline KYB: postulación de productoras. Solo SuperAdmin aprueba/rechaza.';

-- updated_at trigger (reusa patrón si existe; sino define uno liviano)
create or replace function public.set_organizer_applications_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizer_applications_set_updated_at
  on public.organizer_applications;
create trigger organizer_applications_set_updated_at
  before update on public.organizer_applications
  for each row
  execute function public.set_organizer_applications_updated_at();

-- -----------------------------------------------------------------------------
-- 4) RLS
-- -----------------------------------------------------------------------------
alter table public.organizer_applications enable row level security;

drop policy if exists "organizer_applications_select_own_or_super"
  on public.organizer_applications;
create policy "organizer_applications_select_own_or_super"
  on public.organizer_applications
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_super_admin())
  );

drop policy if exists "organizer_applications_insert_own"
  on public.organizer_applications;
create policy "organizer_applications_insert_own"
  on public.organizer_applications
  for insert
  to authenticated
  with check (
    id = (select auth.uid())
    and status = 'pending'::public.organizer_application_status
  );

-- Dueño NO puede update (ni status). Solo SuperAdmin.
drop policy if exists "organizer_applications_update_super"
  on public.organizer_applications;
create policy "organizer_applications_update_super"
  on public.organizer_applications
  for update
  to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists "organizer_applications_delete_super"
  on public.organizer_applications;
create policy "organizer_applications_delete_super"
  on public.organizer_applications
  for delete
  to authenticated
  using ((select public.is_super_admin()));

grant select, insert on public.organizer_applications to authenticated;
grant update, delete on public.organizer_applications to authenticated;
grant all on public.organizer_applications to service_role;

-- Progressive profiling: el comprador puede persistir DNI + teléfono en su perfil.
-- Rol / approval_status siguen bloqueados a nivel de columna (solo service_role).
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, public_name, public_bio, dni, phone)
  on public.profiles to authenticated;
