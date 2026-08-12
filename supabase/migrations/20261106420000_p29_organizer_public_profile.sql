-- =============================================================================
-- Tokepass · P29 — Perfil público del organizador (avatar, nombre, bajada)
-- =============================================================================

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists public_name text,
  add column if not exists public_bio text;

comment on column public.profiles.avatar_url is
  'URL pública del logo / foto de la productora';
comment on column public.profiles.public_name is
  'Nombre público de la productora (storefront B2C)';
comment on column public.profiles.public_bio is
  'Bajada corta visible en la ficha del evento';

-- Column-level UPDATE: el organizador solo edita campos de presentación.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, public_name, public_bio)
  on public.profiles to authenticated;

-- Lectura pública acotada vía RPC (no expone email/DNI/rol).
create or replace function public.get_public_organizer_profile(p_organizer_id uuid)
returns table (
  public_name text,
  public_bio text,
  avatar_url text,
  full_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    nullif(trim(p.public_name), ''),
    nullif(trim(p.public_bio), ''),
    nullif(trim(p.avatar_url), ''),
    nullif(trim(p.full_name), '')
  from public.profiles as p
  where p.id = p_organizer_id
    and (
      p.role::text in ('admin', 'super_admin')
      or exists (
        select 1
        from public.events as e
        where e.organizer_id = p.id
          and e.status = 'published'::public.event_status
      )
    )
  limit 1;
$$;

revoke all on function public.get_public_organizer_profile(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_organizer_profile(uuid)
  to anon, authenticated, service_role;
