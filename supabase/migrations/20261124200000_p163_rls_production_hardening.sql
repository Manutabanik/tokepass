-- P163: hardening RLS for production.
-- Cross-tenant draft/event writes were already blocked by events_update_own.
-- This closes global artist mutation, aligns seating_maps with the organizer
-- approval gate, and revokes catalog writes from anon.

alter table public.artists
  add column if not exists created_by uuid;

comment on column public.artists.created_by is
  'Organizador que creó el artista. UPDATE sólo dueño o super_admin.';

create or replace function public.artists_set_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists artists_set_created_by_trg on public.artists;
create trigger artists_set_created_by_trg
before insert on public.artists
for each row
execute function public.artists_set_created_by();

do $$
begin
  drop policy if exists artists_update_organizer on public.artists;
  drop policy if exists artists_update_own on public.artists;
end
$$;

create policy artists_update_own
  on public.artists
  for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      created_by is not null
      and created_by = (select auth.uid())
    )
  )
  with check (
    public.is_super_admin()
    or (
      created_by is not null
      and created_by = (select auth.uid())
    )
  );

drop policy if exists seating_maps_organizer_write on public.seating_maps;
create policy seating_maps_organizer_write
  on public.seating_maps
  for all
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_approved_organizer((select auth.uid()))
      and exists (
        select 1
        from public.events as e
        where e.id = seating_maps.event_id
          and e.organizer_id = (select auth.uid())
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.is_approved_organizer((select auth.uid()))
      and exists (
        select 1
        from public.events as e
        where e.id = seating_maps.event_id
          and e.organizer_id = (select auth.uid())
      )
    )
  );

revoke insert, update, delete on table public.events from anon;
revoke insert, update, delete on table public.ticket_tiers from anon;
revoke insert, update, delete on table public.event_artists from anon;
revoke insert, update, delete on table public.event_schedules from anon;
revoke insert, update, delete on table public.artists from anon;
revoke insert, update, delete on table public.seating_maps from anon;

grant select on table public.events to anon;
grant select on table public.ticket_tiers to anon;
grant select on table public.event_artists to anon;
grant select on table public.event_schedules to anon;
grant select on table public.artists to anon;
grant select on table public.seating_maps to anon;
