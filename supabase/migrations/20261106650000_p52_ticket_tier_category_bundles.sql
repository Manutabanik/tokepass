-- P52: Categoría de tarifa (standard / bundle / special) + precio de lista para packs.

do $$ begin
  create type public.ticket_tier_category as enum ('standard', 'bundle', 'special');
exception
  when duplicate_object then null;
end $$;

alter table public.ticket_tiers
  add column if not exists category public.ticket_tier_category not null default 'standard';

alter table public.ticket_tiers
  add column if not exists list_price numeric(12, 2);

comment on column public.ticket_tiers.category is
  'standard = entrada individual; bundle = combo/abono/kit; special = jubilados/PCD/estudiantes.';
comment on column public.ticket_tiers.list_price is
  'Valor de referencia (suma de ítems/días) para mostrar ahorro vs price All-In.';

create index if not exists ticket_tiers_event_category_idx
  on public.ticket_tiers (event_id, category);

-- Heurística inicial: abono (sin day_id en evento multi-jornada) → bundle.
update public.ticket_tiers as tt
set category = 'bundle'
from public.events as e
where tt.event_id = e.id
  and tt.category = 'standard'
  and tt.day_id is null
  and jsonb_typeof(e.schedule_days) = 'array'
  and jsonb_array_length(e.schedule_days) > 1;

update public.ticket_tiers
set category = 'bundle'
where category = 'standard'
  and layout_type = 'table_combo';

update public.ticket_tiers
set category = 'special'
where category = 'standard'
  and name ~* '(jubilad|pcd|discapacidad|estudiante|mayor|cud)';

update public.ticket_tiers tt
set category = 'bundle'
where tt.category = 'standard'
  and exists (
    select 1
    from public.ticket_tier_combo_items c
    where c.tier_id = tt.id
  );
