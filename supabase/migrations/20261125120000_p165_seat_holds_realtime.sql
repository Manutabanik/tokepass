-- P165: seat_holds visible para el mapa público + Realtime INSERT/DELETE.

alter table public.seat_holds replica identity full;

grant select on table public.seat_holds to anon, authenticated;

drop policy if exists seat_holds_public_occupancy on public.seat_holds;
create policy seat_holds_public_occupancy
  on public.seat_holds
  for select
  to anon, authenticated
  using (
    expires_at > now()
    and exists (
      select 1
      from public.events as e
      where e.id = seat_holds.event_id
        and e.status = 'published'
        and e.visibility = 'public'
    )
  );

drop policy if exists seat_holds_organizer_select on public.seat_holds;
create policy seat_holds_organizer_select
  on public.seat_holds
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.events as e
      where e.id = seat_holds.event_id
        and (
          e.organizer_id = (select auth.uid())
          or (select public.is_super_admin())
        )
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'seat_holds'
  ) then
    alter publication supabase_realtime add table public.seat_holds;
  end if;
end $$;
