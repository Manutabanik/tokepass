-- P34: Live Ops Dashboard — Realtime on public.tickets
-- Enables postgres_changes for organizers watching door admissions.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;
end $$;

-- Include full row in UPDATE old/new so clients can detect admission deltas.
alter table public.tickets replica identity full;
