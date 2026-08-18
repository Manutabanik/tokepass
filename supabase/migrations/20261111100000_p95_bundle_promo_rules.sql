-- P95 Promotional rules for combos: percentage, fixed amount, X-for-Y.

alter table public.ticket_tiers
  add column if not exists promo_discount_type text;

alter table public.ticket_tiers
  add column if not exists promo_discount_value numeric(12, 2) not null default 0;

alter table public.ticket_tiers
  add column if not exists promo_required_qty integer not null default 1;

alter table public.ticket_tiers
  add column if not exists promo_pay_qty integer not null default 1;

alter table public.ticket_tiers
  drop constraint if exists ticket_tiers_promo_discount_type_check;

alter table public.ticket_tiers
  add constraint ticket_tiers_promo_discount_type_check
  check (
    promo_discount_type is null
    or promo_discount_type in ('PORCENTAJE', 'MONTO_FIJO', 'X_POR_Y')
  );

comment on column public.ticket_tiers.promo_discount_type is
  'Regla del combo: PORCENTAJE | MONTO_FIJO | X_POR_Y. Null en entradas simples.';

comment on column public.ticket_tiers.promo_discount_value is
  'Porcentaje (0-100) o monto fijo a descontar, según promo_discount_type.';

comment on column public.ticket_tiers.promo_required_qty is
  'Cantidad requerida (X en X por Y, o unidad N para % en la 2ª).';

comment on column public.ticket_tiers.promo_pay_qty is
  'Cantidad que se paga en X por Y.';

-- CREATE OR REPLACE cannot insert columns before created_at/updated_at
-- (42P16: cannot change name of view column). Drop + recreate, and keep
-- the original ordinals; append promo fields at the end.
drop view if exists public.event_bundles;

create view public.event_bundles as
select
  tt.id,
  tt.event_id,
  tt.name,
  coalesce(tt.bundle_type, 'cross_sell_pack') as bundle_type,
  tt.price,
  tt.list_price as original_price,
  tt.capacity,
  tt.sold,
  coalesce(tt.bundle_items, '[]'::jsonb) as items,
  tt.created_at,
  tt.updated_at,
  tt.promo_discount_type,
  tt.promo_discount_value,
  tt.promo_required_qty,
  tt.promo_pay_qty
from public.ticket_tiers as tt
where tt.tier_type = 'bundle' or tt.category = 'bundle';

comment on view public.event_bundles is
  'Combos vendibles. items = [{tier_id, quantity}]. Precio promocional = price. Regla en promo_*.';

grant select on public.event_bundles to authenticated, service_role;
