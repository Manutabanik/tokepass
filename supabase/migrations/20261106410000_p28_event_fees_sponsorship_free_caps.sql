-- =============================================================================
-- P28: Event-level platform fees, free-ticket caps, Tokepass sponsorship
-- =============================================================================

alter table public.events
  add column if not exists platform_fee_percentage numeric(6, 2),
  add column if not exists platform_fixed_fee numeric(12, 2),
  add column if not exists max_free_tickets integer,
  add column if not exists is_sponsored_by_tokepass boolean;

-- Preserve economics for existing events: percentage from organizer rate, no fixed fee.
update public.events as e
set
  platform_fee_percentage = coalesce(
    e.platform_fee_percentage,
    round(coalesce(p.service_charge_rate, 0.15) * 100, 2)
  ),
  platform_fixed_fee = coalesce(e.platform_fixed_fee, 0),
  max_free_tickets = coalesce(e.max_free_tickets, 100),
  is_sponsored_by_tokepass = coalesce(e.is_sponsored_by_tokepass, false)
from public.profiles as p
where p.id = e.organizer_id
  and (
    e.platform_fee_percentage is null
    or e.platform_fixed_fee is null
    or e.max_free_tickets is null
    or e.is_sponsored_by_tokepass is null
  );

update public.events
set
  platform_fee_percentage = coalesce(platform_fee_percentage, 8.00),
  platform_fixed_fee = coalesce(platform_fixed_fee, 0),
  max_free_tickets = coalesce(max_free_tickets, 100),
  is_sponsored_by_tokepass = coalesce(is_sponsored_by_tokepass, false)
where
  platform_fee_percentage is null
  or platform_fixed_fee is null
  or max_free_tickets is null
  or is_sponsored_by_tokepass is null;

alter table public.events
  alter column platform_fee_percentage set default 8.00,
  alter column platform_fixed_fee set default 200.00,
  alter column max_free_tickets set default 100,
  alter column is_sponsored_by_tokepass set default false;

alter table public.events
  alter column platform_fee_percentage set not null,
  alter column platform_fixed_fee set not null,
  alter column max_free_tickets set not null,
  alter column is_sponsored_by_tokepass set not null;

alter table public.events
  drop constraint if exists events_platform_fee_percentage_range;
alter table public.events
  add constraint events_platform_fee_percentage_range
  check (platform_fee_percentage >= 0 and platform_fee_percentage <= 95);

alter table public.events
  drop constraint if exists events_platform_fixed_fee_nonneg;
alter table public.events
  add constraint events_platform_fixed_fee_nonneg
  check (platform_fixed_fee >= 0);

alter table public.events
  drop constraint if exists events_max_free_tickets_nonneg;
alter table public.events
  add constraint events_max_free_tickets_nonneg
  check (max_free_tickets >= 0);

comment on column public.events.platform_fee_percentage is
  'Comisión % Tokepass sobre precio público All-In (ej. 8.00 = 8%).';
comment on column public.events.platform_fixed_fee is
  'Cargo fijo ARS por entrada paga incluido en el split All-In.';
comment on column public.events.max_free_tickets is
  'Tope de capacidad total de tiers a precio $0 (anti-fraude puerta).';
comment on column public.events.is_sponsored_by_tokepass is
  'Si true, Tokepass bonifica infraestructura (fee % y fijo = 0).';

-- Only super_admin (or service_role) may mutate fee / sponsorship knobs.
create or replace function public.events_protect_commercial_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and current_user is distinct from 'service_role'
     and not public.is_super_admin()
     and (
       new.platform_fee_percentage is distinct from old.platform_fee_percentage
       or new.platform_fixed_fee is distinct from old.platform_fixed_fee
       or new.max_free_tickets is distinct from old.max_free_tickets
       or new.is_sponsored_by_tokepass is distinct from old.is_sponsored_by_tokepass
     ) then
    raise exception 'Solo SuperAdmin puede modificar fees / sponsorship del evento'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists events_protect_commercial_columns_trg on public.events;
create trigger events_protect_commercial_columns_trg
  before update on public.events
  for each row
  execute function public.events_protect_commercial_columns();

-- Public rate helper: event override (sponsored → 0), else organizer profile.
create or replace function public.get_event_service_charge_rate(p_event_id uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when e.is_sponsored_by_tokepass then 0::numeric
    else least(
      0.95,
      greatest(
        0,
        coalesce(e.platform_fee_percentage, 8.00) / 100.0
      )
    )
  end
  from public.events as e
  where e.id = p_event_id;
$$;

revoke all on function public.get_event_service_charge_rate(uuid) from public;
grant execute on function public.get_event_service_charge_rate(uuid)
  to anon, authenticated, service_role;

create or replace function public.get_event_platform_fixed_fee(p_event_id uuid)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when e.is_sponsored_by_tokepass then 0::numeric
    else greatest(0, coalesce(e.platform_fixed_fee, 0))
  end
  from public.events as e
  where e.id = p_event_id;
$$;

revoke all on function public.get_event_platform_fixed_fee(uuid) from public;
grant execute on function public.get_event_platform_fixed_fee(uuid)
  to anon, authenticated, service_role;
