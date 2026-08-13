-- P37: Taxonomía centralizada de categorías de eventos (Super Admin)
-- events.category_id (FK many-to-one) alineado a venue_id; sin junction M2M.

create table if not exists public.event_categories (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  slug varchar(120) not null,
  icon_name varchar(64),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_categories_slug_unique unique (slug),
  constraint event_categories_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

create index if not exists event_categories_active_sort_idx
  on public.event_categories (is_active, sort_order, name);

alter table public.events
  add column if not exists category_id uuid
    references public.event_categories (id)
    on delete set null;

create index if not exists events_category_id_idx
  on public.events (category_id)
  where category_id is not null;

-- updated_at touch
create or replace function public.set_event_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_event_categories_updated_at on public.event_categories;
create trigger trg_event_categories_updated_at
  before update on public.event_categories
  for each row
  execute function public.set_event_categories_updated_at();

-- RLS
alter table public.event_categories enable row level security;

drop policy if exists event_categories_select_all on public.event_categories;
create policy event_categories_select_all
  on public.event_categories
  for select
  to anon, authenticated
  using (true);

drop policy if exists event_categories_insert_superadmin on public.event_categories;
create policy event_categories_insert_superadmin
  on public.event_categories
  for insert
  to authenticated
  with check ((select public.is_super_admin()));

drop policy if exists event_categories_update_superadmin on public.event_categories;
create policy event_categories_update_superadmin
  on public.event_categories
  for update
  to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

drop policy if exists event_categories_delete_superadmin on public.event_categories;
create policy event_categories_delete_superadmin
  on public.event_categories
  for delete
  to authenticated
  using ((select public.is_super_admin()));

grant select on public.event_categories to anon, authenticated;
grant insert, update, delete on public.event_categories to authenticated;

-- Seed inicial (idempotente por slug)
insert into public.event_categories (name, slug, icon_name, sort_order, is_active)
values
  ('Fiestas', 'fiestas', 'disc3', 10, true),
  ('Recitales', 'recitales', 'mic2', 20, true),
  ('Teatro & Cultura', 'teatro-y-cultura', 'clapperboard', 30, true),
  ('Deportes', 'deportes', 'trophy', 40, true)
on conflict (slug) do nothing;

comment on table public.event_categories is
  'Taxonomía centralizada B2C/B2B. Solo super_admin escribe; todos leen.';
comment on column public.events.category_id is
  'Categoría de taxonomía (opcional). Filtrado exacto en discovery.';
