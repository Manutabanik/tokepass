-- =============================================================================
-- P46: Favoritos de comprador (user_favorites)
-- =============================================================================

create table if not exists public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create index if not exists user_favorites_user_created_idx
  on public.user_favorites (user_id, created_at desc);

create index if not exists user_favorites_event_idx
  on public.user_favorites (event_id);

comment on table public.user_favorites is
  'Eventos guardados por compradores para comprar después.';

alter table public.user_favorites enable row level security;

drop policy if exists user_favorites_select_own on public.user_favorites;
create policy user_favorites_select_own
  on public.user_favorites
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_favorites_insert_own on public.user_favorites;
create policy user_favorites_insert_own
  on public.user_favorites
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_favorites_delete_own on public.user_favorites;
create policy user_favorites_delete_own
  on public.user_favorites
  for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.user_favorites to authenticated;
grant all on public.user_favorites to service_role;
