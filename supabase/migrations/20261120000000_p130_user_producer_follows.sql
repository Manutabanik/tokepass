-- =============================================================================
-- P130: Grafo social comprador -> productora (user_producer_follows)
-- =============================================================================

create table if not exists public.user_producer_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  producer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, producer_id),
  constraint user_producer_follows_no_self check (user_id <> producer_id)
);

create index if not exists user_producer_follows_producer_idx
  on public.user_producer_follows (producer_id, created_at desc);

comment on table public.user_producer_follows is
  'Seguidores de productoras. Cada comprador solo ve y muta sus propios follows.';

alter table public.user_producer_follows enable row level security;

drop policy if exists user_producer_follows_select_own on public.user_producer_follows;
create policy user_producer_follows_select_own
  on public.user_producer_follows
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_producer_follows_insert_own on public.user_producer_follows;
create policy user_producer_follows_insert_own
  on public.user_producer_follows
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_producer_follows_delete_own on public.user_producer_follows;
create policy user_producer_follows_delete_own
  on public.user_producer_follows
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.user_producer_follows from public, anon;
grant select, insert, delete on table public.user_producer_follows to authenticated;
grant all on table public.user_producer_follows to service_role;
