-- Flags derivados de la matriz (precio $0 / día desactivado).
-- No toca public.tickets ni public.orders.

alter table public.ticket_tiers
  add column if not exists is_free boolean not null default false;

alter table public.ticket_tiers
  add column if not exists is_active boolean not null default true;

comment on column public.ticket_tiers.is_free is
  'true cuando price = 0. Se sincroniza en el trigger; no borrar filas.';

comment on column public.ticket_tiers.is_active is
  'false cuando visibility = private (día desactivado en la matriz).';

update public.ticket_tiers
set
  is_free = (coalesce(price, 0) = 0),
  is_active = (coalesce(visibility, 'public') is distinct from 'private')
where
  is_free is distinct from (coalesce(price, 0) = 0)
  or is_active is distinct from (coalesce(visibility, 'public') is distinct from 'private');

create or replace function public.sync_ticket_tier_matrix_flags()
returns trigger
language plpgsql
as $$
begin
  new.is_free := coalesce(new.price, 0) = 0;
  new.is_active := coalesce(new.visibility, 'public') is distinct from 'private';
  return new;
end;
$$;

drop trigger if exists ticket_tiers_sync_matrix_flags on public.ticket_tiers;
create trigger ticket_tiers_sync_matrix_flags
before insert or update of price, visibility, is_free, is_active
on public.ticket_tiers
for each row
execute function public.sync_ticket_tier_matrix_flags();
