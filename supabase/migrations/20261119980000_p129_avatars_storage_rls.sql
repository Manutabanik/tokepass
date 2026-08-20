-- P129 · bucket avatars + RLS por carpeta de usuario

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_public_select on storage.objects;
create policy avatars_public_select
on storage.objects
for select
to public
using (bucket_id = 'avatars');

drop policy if exists avatars_own_rw on storage.objects;
create policy avatars_own_rw
on storage.objects
for all
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists event_flyers_owner_write on storage.objects;
create policy event_flyers_owner_write
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-flyers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Organizadores solo escriben su carpeta. Super admin puede cualquier path.
drop policy if exists "event_flyers_admin_insert" on storage.objects;
create policy "event_flyers_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-flyers'
  and exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role::text in ('admin', 'super_admin')
  )
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  )
);

drop policy if exists "event_flyers_admin_update" on storage.objects;
create policy "event_flyers_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-flyers'
  and exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role::text in ('admin', 'super_admin')
  )
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  )
)
with check (
  bucket_id = 'event-flyers'
  and exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role::text in ('admin', 'super_admin')
  )
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  )
);

drop policy if exists "event_flyers_admin_delete" on storage.objects;
create policy "event_flyers_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-flyers'
  and exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role::text in ('admin', 'super_admin')
  )
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.profiles as p
      where p.id = (select auth.uid())
        and p.role::text = 'super_admin'
    )
  )
);
