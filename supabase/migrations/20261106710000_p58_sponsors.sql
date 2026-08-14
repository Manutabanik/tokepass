-- P58: Sponsors globales (platform partners) y auspiciantes por evento.
-- Bucket público `sponsors` (PNG/SVG/WEBP/JPEG). Sin cambios de schema en events.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sponsors',
  'sponsors',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sponsors_public_select" on storage.objects;
drop policy if exists "sponsors_platform_write" on storage.objects;
drop policy if exists "sponsors_platform_update" on storage.objects;
drop policy if exists "sponsors_platform_delete" on storage.objects;
drop policy if exists "sponsors_event_insert" on storage.objects;
drop policy if exists "sponsors_event_update" on storage.objects;
drop policy if exists "sponsors_event_delete" on storage.objects;

create policy "sponsors_public_select"
on storage.objects
for select
to public
using (bucket_id = 'sponsors');

-- platform/{uuid}/...
create policy "sponsors_platform_write"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = 'platform'
  and public.is_super_admin()
);

create policy "sponsors_platform_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = 'platform'
  and public.is_super_admin()
)
with check (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = 'platform'
  and public.is_super_admin()
);

create policy "sponsors_platform_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = 'platform'
  and public.is_super_admin()
);

-- events/{event_id}/...
create policy "sponsors_event_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = 'events'
  and (
    public.is_super_admin()
    or public.owns_event(((storage.foldername(name))[2])::uuid)
  )
);

create policy "sponsors_event_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = 'events'
  and (
    public.is_super_admin()
    or public.owns_event(((storage.foldername(name))[2])::uuid)
  )
)
with check (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = 'events'
  and (
    public.is_super_admin()
    or public.owns_event(((storage.foldername(name))[2])::uuid)
  )
);

create policy "sponsors_event_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'sponsors'
  and (storage.foldername(name))[1] = 'events'
  and (
    public.is_super_admin()
    or public.owns_event(((storage.foldername(name))[2])::uuid)
  )
);

create table if not exists public.platform_sponsors (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  logo_url text not null,
  website_url text,
  is_active boolean not null default true,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_sponsors_name_len check (char_length(btrim(name)) >= 2)
);

create index if not exists platform_sponsors_active_order_idx
  on public.platform_sponsors (is_active, display_order, name);

drop trigger if exists platform_sponsors_set_updated_at on public.platform_sponsors;
create trigger platform_sponsors_set_updated_at
before update on public.platform_sponsors
for each row execute function public.set_updated_at();

alter table public.platform_sponsors enable row level security;

drop policy if exists platform_sponsors_select_public on public.platform_sponsors;
create policy platform_sponsors_select_public
  on public.platform_sponsors
  for select
  to anon, authenticated
  using (is_active = true or public.is_super_admin());

drop policy if exists platform_sponsors_mutate_superadmin on public.platform_sponsors;
create policy platform_sponsors_mutate_superadmin
  on public.platform_sponsors
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select on public.platform_sponsors to anon, authenticated;
grant insert, update, delete on public.platform_sponsors to authenticated;

create table if not exists public.event_sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name varchar(120) not null,
  logo_url text not null,
  website_url text,
  tier text not null default 'regular',
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sponsors_tier_check check (tier in ('main', 'regular')),
  constraint event_sponsors_name_len check (char_length(btrim(name)) >= 2)
);

create index if not exists event_sponsors_event_order_idx
  on public.event_sponsors (event_id, tier, display_order);

drop trigger if exists event_sponsors_set_updated_at on public.event_sponsors;
create trigger event_sponsors_set_updated_at
before update on public.event_sponsors
for each row execute function public.set_updated_at();

alter table public.event_sponsors enable row level security;

drop policy if exists event_sponsors_select_public on public.event_sponsors;
create policy event_sponsors_select_public
  on public.event_sponsors
  for select
  to anon, authenticated
  using (true);

drop policy if exists event_sponsors_insert_owner on public.event_sponsors;
create policy event_sponsors_insert_owner
  on public.event_sponsors
  for insert
  to authenticated
  with check (
    public.is_super_admin()
    or public.owns_event(event_id)
  );

drop policy if exists event_sponsors_update_owner on public.event_sponsors;
create policy event_sponsors_update_owner
  on public.event_sponsors
  for update
  to authenticated
  using (
    public.is_super_admin()
    or public.owns_event(event_id)
  )
  with check (
    public.is_super_admin()
    or public.owns_event(event_id)
  );

drop policy if exists event_sponsors_delete_owner on public.event_sponsors;
create policy event_sponsors_delete_owner
  on public.event_sponsors
  for delete
  to authenticated
  using (
    public.is_super_admin()
    or public.owns_event(event_id)
  );

grant select on public.event_sponsors to anon, authenticated;
grant insert, update, delete on public.event_sponsors to authenticated;

comment on table public.platform_sponsors is
  'Partners corporativos Tokepass (landing). Solo Super Admin escribe.';
comment on table public.event_sponsors is
  'Auspiciantes de un evento (storefront + ticket). Organizer o Super Admin.';
