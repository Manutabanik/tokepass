-- P51: Matriz de precios Zona × Tipo de entrada (mesas/combos)
-- + sector_key para enlazar seating_layout sin depender solo de event_zones.

create table if not exists public.zone_tier_pricing (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  zone_id uuid references public.event_zones(id) on delete set null,
  sector_key text not null,
  ticket_tier_id uuid not null references public.ticket_tiers(id) on delete cascade,
  price numeric(12, 2) not null default 0 check (price >= 0),
  table_number_start integer check (table_number_start is null or table_number_start >= 1),
  table_number_end integer check (table_number_end is null or table_number_end >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zone_tier_pricing_table_range_chk check (
    table_number_start is null
    or table_number_end is null
    or table_number_end >= table_number_start
  ),
  constraint zone_tier_pricing_event_sector_tier_key
    unique (event_id, sector_key, ticket_tier_id)
);

create index if not exists zone_tier_pricing_event_id_idx
  on public.zone_tier_pricing (event_id);

create index if not exists zone_tier_pricing_tier_id_idx
  on public.zone_tier_pricing (ticket_tier_id);

create index if not exists zone_tier_pricing_zone_id_idx
  on public.zone_tier_pricing (zone_id)
  where zone_id is not null;

comment on table public.zone_tier_pricing is
  'Precio All-In por combinación Sector/Zona × Tipo de entrada (mesa/combo).';
comment on column public.zone_tier_pricing.sector_key is
  'ID del sector en venues.seating_layout / event_seating_units.sector_id.';
comment on column public.zone_tier_pricing.table_number_start is
  'Inicio del rango de mesas/asientos habilitados para esta tarifa.';
comment on column public.zone_tier_pricing.table_number_end is
  'Fin del rango de mesas/asientos habilitados para esta tarifa.';

alter table public.zone_tier_pricing enable row level security;

drop policy if exists zone_tier_pricing_select_public on public.zone_tier_pricing;
create policy zone_tier_pricing_select_public
  on public.zone_tier_pricing
  for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.events e
      where e.id = zone_tier_pricing.event_id
        and (
          e.status in ('published', 'paused')
          or e.organizer_id = (select auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid()) and p.role = 'super_admin'
          )
        )
    )
  );

drop policy if exists zone_tier_pricing_write_organizer on public.zone_tier_pricing;
create policy zone_tier_pricing_write_organizer
  on public.zone_tier_pricing
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = zone_tier_pricing.event_id
        and (
          e.organizer_id = (select auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid()) and p.role = 'super_admin'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = zone_tier_pricing.event_id
        and (
          e.organizer_id = (select auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid()) and p.role = 'super_admin'
          )
        )
    )
  );

create or replace function public.set_zone_tier_pricing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists zone_tier_pricing_set_updated_at on public.zone_tier_pricing;
create trigger zone_tier_pricing_set_updated_at
  before update on public.zone_tier_pricing
  for each row
  execute function public.set_zone_tier_pricing_updated_at();
