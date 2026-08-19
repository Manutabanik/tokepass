-- P109: Cupones vinculados a RRPP + liquidaciones manuales de comisiones.
-- El cupón con promoter_id pisa la cookie rrpp_code al reservar la orden.

alter table public.promo_codes
  add column if not exists promoter_id uuid
    references public.promoters (id) on delete set null;

create index if not exists promo_codes_promoter_id_idx
  on public.promo_codes (promoter_id)
  where promoter_id is not null;

comment on column public.promo_codes.promoter_id is
  'RRPP dueño del cupón. Si está set, el checkout atribuye la venta a este promotor (manda sobre ?rrpp=/cookie).';

create or replace function public.enforce_promo_code_promoter_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event_organizer uuid;
  v_promoter_organizer uuid;
begin
  if new.promoter_id is null then
    return new;
  end if;

  select e.organizer_id
    into v_event_organizer
  from public.events as e
  where e.id = new.event_id;

  select p.organizer_id
    into v_promoter_organizer
  from public.promoters as p
  where p.id = new.promoter_id;

  if v_event_organizer is null
     or v_promoter_organizer is null
     or v_event_organizer is distinct from v_promoter_organizer then
    raise exception 'Promoter does not belong to the event organizer'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists promo_codes_enforce_promoter_owner on public.promo_codes;
create trigger promo_codes_enforce_promoter_owner
before insert or update of promoter_id, event_id
on public.promo_codes
for each row
execute function public.enforce_promo_code_promoter_owner();

-- -----------------------------------------------------------------------------
-- Liquidaciones manuales: el organizador marca el saldo del RRPP como pagado.
-- pending = comisiones de órdenes pagadas − suma(promoter_settlements.amount)
-- -----------------------------------------------------------------------------

create table if not exists public.promoter_settlements (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  promoter_id uuid not null references public.promoters (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  settled_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists promoter_settlements_promoter_idx
  on public.promoter_settlements (promoter_id, settled_at desc);

create index if not exists promoter_settlements_organizer_idx
  on public.promoter_settlements (organizer_id, settled_at desc);

comment on table public.promoter_settlements is
  'Pagos manuales de comisiones RRPP. Cada fila resta del saldo pendiente del promotor.';

create or replace function public.enforce_promoter_settlement_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select p.organizer_id
    into v_org
  from public.promoters as p
  where p.id = new.promoter_id;

  if v_org is null or v_org is distinct from new.organizer_id then
    raise exception 'Promoter does not belong to organizer'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists promoter_settlements_enforce_owner
  on public.promoter_settlements;
create trigger promoter_settlements_enforce_owner
before insert or update of promoter_id, organizer_id
on public.promoter_settlements
for each row
execute function public.enforce_promoter_settlement_owner();

alter table public.promoter_settlements enable row level security;

revoke all on table public.promoter_settlements from public, anon;
grant select, insert on table public.promoter_settlements to authenticated;
grant all on table public.promoter_settlements to service_role;

drop policy if exists promoter_settlements_select_owner on public.promoter_settlements;
create policy promoter_settlements_select_owner
on public.promoter_settlements
for select
to authenticated
using (
  organizer_id = (select auth.uid())
  or (select public.is_super_admin())
);

drop policy if exists promoter_settlements_insert_owner on public.promoter_settlements;
create policy promoter_settlements_insert_owner
on public.promoter_settlements
for insert
to authenticated
with check (
  organizer_id = (select auth.uid())
  and created_by = (select auth.uid())
  and (
    public.is_approved_organizer((select auth.uid()))
    or (select public.is_super_admin())
  )
);
