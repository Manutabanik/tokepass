-- P135 · Realtime del catalogo publico (evento, tarifas y mapa)
-- El comprador escucha UPDATE de events y cambios de ticket_tiers del evento.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ticket_tiers'
  ) then
    alter publication supabase_realtime add table public.ticket_tiers;
  end if;
end $$;

alter table public.events replica identity full;
alter table public.ticket_tiers replica identity full;

comment on table public.events is
  'Realtime: UPDATE filtrado por id para refrescar mapa y ficha publica.';
