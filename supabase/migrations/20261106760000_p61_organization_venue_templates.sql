-- =============================================================================
-- Tokepass · Plantillas de recinto del organizador
-- 2026-08-14
-- =============================================================================

create table if not exists public.organization_venue_templates (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  venue_map jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_venue_templates_organizer_idx
  on public.organization_venue_templates (organizer_id, updated_at desc);

create unique index if not exists organization_venue_templates_organizer_name_idx
  on public.organization_venue_templates (organizer_id, lower(btrim(name)));

comment on table public.organization_venue_templates is
  'Presets de venue_map reutilizables por organizador en el studio de mapas.';

alter table public.organization_venue_templates enable row level security;

revoke all on public.organization_venue_templates from public, anon;
grant select, insert, update, delete on public.organization_venue_templates to authenticated;
grant all on public.organization_venue_templates to service_role;

drop policy if exists organization_venue_templates_select_own
  on public.organization_venue_templates;
create policy organization_venue_templates_select_own
on public.organization_venue_templates
for select
to authenticated
using (
  organizer_id = (select auth.uid())
  or (select public.is_super_admin())
);

drop policy if exists organization_venue_templates_insert_own
  on public.organization_venue_templates;
create policy organization_venue_templates_insert_own
on public.organization_venue_templates
for insert
to authenticated
with check (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
);

drop policy if exists organization_venue_templates_update_own
  on public.organization_venue_templates;
create policy organization_venue_templates_update_own
on public.organization_venue_templates
for update
to authenticated
using (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
)
with check (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
);

drop policy if exists organization_venue_templates_delete_own
  on public.organization_venue_templates;
create policy organization_venue_templates_delete_own
on public.organization_venue_templates
for delete
to authenticated
using (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or (select public.is_super_admin())
);

drop trigger if exists organization_venue_templates_set_updated_at
  on public.organization_venue_templates;
create trigger organization_venue_templates_set_updated_at
before update on public.organization_venue_templates
for each row execute function public.set_updated_at();
