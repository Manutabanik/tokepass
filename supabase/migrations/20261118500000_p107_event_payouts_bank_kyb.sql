-- =============================================================================
-- P107: Perfiles de cobro (KYB bancario) + liquidaciones por evento
-- Toda la venta se centraliza en TokePass y se libera vía event_payouts.
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'organizer_bank_verification_status'
  ) then
    create type public.organizer_bank_verification_status as enum (
      'unverified',
      'pending_review',
      'verified',
      'rejected'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'event_payout_status'
  ) then
    create type public.event_payout_status as enum (
      'hold',
      'pending_approval',
      'processing',
      'completed',
      'cancelled'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- organizer_profiles: datos de cobro (CBU/CUIT)
-- -----------------------------------------------------------------------------
create table if not exists public.organizer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  full_name_or_company text not null
    check (char_length(btrim(full_name_or_company)) >= 2),
  tax_id text not null
    check (char_length(regexp_replace(tax_id, '\D', '', 'g')) between 10 and 13),
  bank_cbu_cvu text
    check (
      bank_cbu_cvu is null
      or char_length(regexp_replace(bank_cbu_cvu, '\D', '', 'g')) = 22
    ),
  bank_alias text
    check (
      bank_alias is null
      or char_length(btrim(bank_alias)) between 6 and 80
    ),
  bank_name text
    check (
      bank_name is null
      or char_length(btrim(bank_name)) between 2 and 120
    ),
  verification_status public.organizer_bank_verification_status
    not null default 'pending_review',
  review_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_profiles_has_destination check (
    bank_cbu_cvu is not null
    or char_length(btrim(coalesce(bank_alias, ''))) >= 6
  )
);

create index if not exists organizer_profiles_verification_idx
  on public.organizer_profiles (verification_status, updated_at desc);

comment on table public.organizer_profiles is
  'KYB de cobro: titular, CUIT/CUIL y CBU/CVU o alias. TokePass liquida solo a cuentas validadas.';

create or replace function public.set_organizer_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizer_profiles_set_updated_at
  on public.organizer_profiles;
create trigger organizer_profiles_set_updated_at
  before update on public.organizer_profiles
  for each row
  execute function public.set_organizer_profiles_updated_at();

create or replace function public.protect_organizer_profile_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_super_admin() then
    return new;
  end if;

  if new.verification_status = 'verified'::public.organizer_bank_verification_status then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and old.verification_status = 'verified'::public.organizer_bank_verification_status
     and (
       new.tax_id is distinct from old.tax_id
       or new.bank_cbu_cvu is distinct from old.bank_cbu_cvu
       or new.bank_alias is distinct from old.bank_alias
       or new.full_name_or_company is distinct from old.full_name_or_company
     ) then
    new.verification_status := 'pending_review'::public.organizer_bank_verification_status;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists organizer_profiles_protect_verification
  on public.organizer_profiles;
create trigger organizer_profiles_protect_verification
  before insert or update on public.organizer_profiles
  for each row
  execute function public.protect_organizer_profile_verification();

alter table public.organizer_profiles enable row level security;

revoke all on public.organizer_profiles from public, anon;
grant select, insert, update on public.organizer_profiles to authenticated;
grant all on public.organizer_profiles to service_role;

drop policy if exists organizer_profiles_select_own_or_super
  on public.organizer_profiles;
create policy organizer_profiles_select_own_or_super
  on public.organizer_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_super_admin())
  );

drop policy if exists organizer_profiles_insert_own
  on public.organizer_profiles;
create policy organizer_profiles_insert_own
  on public.organizer_profiles
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and verification_status in (
      'unverified'::public.organizer_bank_verification_status,
      'pending_review'::public.organizer_bank_verification_status
    )
    and (
      public.is_approved_organizer((select auth.uid()))
      or public.is_super_admin()
    )
  );

drop policy if exists organizer_profiles_update_own
  on public.organizer_profiles;
create policy organizer_profiles_update_own
  on public.organizer_profiles
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_super_admin())
  )
  with check (
    (
      user_id = (select auth.uid())
      and verification_status in (
        'unverified'::public.organizer_bank_verification_status,
        'pending_review'::public.organizer_bank_verification_status,
        'rejected'::public.organizer_bank_verification_status
      )
    )
    or (select public.is_super_admin())
  );

-- Semilla desde postulaciones KYB existentes
insert into public.organizer_profiles (
  user_id,
  full_name_or_company,
  tax_id,
  bank_cbu_cvu,
  bank_alias,
  verification_status
)
select
  a.id,
  a.company_name,
  a.cuit_cuil,
  case
    when char_length(regexp_replace(a.cbu_alias, '\D', '', 'g')) = 22
      then regexp_replace(a.cbu_alias, '\D', '', 'g')
    else null
  end,
  case
    when char_length(regexp_replace(a.cbu_alias, '\D', '', 'g')) = 22
      then null
    else nullif(btrim(a.cbu_alias), '')
  end,
  'pending_review'::public.organizer_bank_verification_status
from public.organizer_applications as a
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- event_payouts: liquidación auditada por evento
-- -----------------------------------------------------------------------------
create table if not exists public.event_payouts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events (id) on delete cascade,
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  gross_amount numeric(14, 2) not null default 0
    check (gross_amount >= 0),
  service_fee_amount numeric(14, 2) not null default 0
    check (service_fee_amount >= 0),
  net_amount numeric(14, 2) not null default 0
    check (net_amount >= 0),
  payout_status public.event_payout_status not null default 'pending_approval',
  scheduled_payout_date timestamptz,
  hold_reason text,
  transferred_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  bank_holder_snapshot text,
  bank_tax_id_snapshot text,
  bank_cbu_snapshot text,
  bank_alias_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_payouts_status_idx
  on public.event_payouts (payout_status, scheduled_payout_date);

create index if not exists event_payouts_organizer_idx
  on public.event_payouts (organizer_id, created_at desc);

comment on table public.event_payouts is
  'Liquidación por evento: bruto, comisión TokePass y neto a transferir al CBU validado.';

create or replace function public.set_event_payouts_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists event_payouts_set_updated_at on public.event_payouts;
create trigger event_payouts_set_updated_at
  before update on public.event_payouts
  for each row
  execute function public.set_event_payouts_updated_at();

alter table public.event_payouts enable row level security;

revoke all on public.event_payouts from public, anon;
grant select on public.event_payouts to authenticated;
grant all on public.event_payouts to service_role;

drop policy if exists event_payouts_select_own_or_super on public.event_payouts;
create policy event_payouts_select_own_or_super
  on public.event_payouts
  for select
  to authenticated
  using (
    organizer_id = (select auth.uid())
    or (select public.is_super_admin())
  );

drop policy if exists event_payouts_update_super on public.event_payouts;
create policy event_payouts_update_super
  on public.event_payouts
  for update
  to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- -----------------------------------------------------------------------------
-- Sincroniza liquidaciones de eventos ya finalizados (fecha transcurrida)
-- -----------------------------------------------------------------------------
create or replace function public.sync_event_payouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  with paid as (
    select
      t.event_id,
      o.id as order_id,
      o.total_amount,
      o.service_charge
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    where o.status = 'paid'
      and coalesce(o.is_test, false) = false
  ),
  distinct_orders as (
    select distinct on (event_id, order_id)
      event_id,
      order_id,
      total_amount,
      service_charge
    from paid
    order by event_id, order_id
  ),
  totals as (
    select
      event_id,
      round(coalesce(sum(total_amount), 0), 2) as gross_amount,
      round(coalesce(sum(service_charge), 0), 2) as service_fee_amount
    from distinct_orders
    group by event_id
  ),
  eligible as (
    select
      e.id as event_id,
      e.organizer_id,
      t.gross_amount,
      t.service_fee_amount,
      greatest(0, round(t.gross_amount - t.service_fee_amount, 2)) as net_amount,
      coalesce(e.ends_at, e.date) + interval '3 days' as scheduled_payout_date,
      op.verification_status,
      op.full_name_or_company,
      op.tax_id,
      op.bank_cbu_cvu,
      op.bank_alias
    from public.events as e
    join totals as t on t.event_id = e.id
    left join public.organizer_profiles as op on op.user_id = e.organizer_id
    where e.status::text in ('published', 'paused')
      and coalesce(e.ends_at, e.date) < now()
      and t.gross_amount > 0
  ),
  upserted as (
    insert into public.event_payouts (
      event_id,
      organizer_id,
      gross_amount,
      service_fee_amount,
      net_amount,
      payout_status,
      scheduled_payout_date,
      hold_reason,
      bank_holder_snapshot,
      bank_tax_id_snapshot,
      bank_cbu_snapshot,
      bank_alias_snapshot
    )
    select
      el.event_id,
      el.organizer_id,
      el.gross_amount,
      el.service_fee_amount,
      el.net_amount,
      case
        when el.verification_status = 'verified'::public.organizer_bank_verification_status
          then 'pending_approval'::public.event_payout_status
        else 'hold'::public.event_payout_status
      end,
      el.scheduled_payout_date,
      case
        when el.verification_status = 'verified'::public.organizer_bank_verification_status
          then null
        else 'CBU/CUIT pendiente de validación o no coincide con el titular.'
      end,
      el.full_name_or_company,
      el.tax_id,
      el.bank_cbu_cvu,
      el.bank_alias
    from eligible as el
    on conflict (event_id) do update
      set
        gross_amount = excluded.gross_amount,
        service_fee_amount = excluded.service_fee_amount,
        net_amount = excluded.net_amount,
        scheduled_payout_date = excluded.scheduled_payout_date,
        bank_holder_snapshot = excluded.bank_holder_snapshot,
        bank_tax_id_snapshot = excluded.bank_tax_id_snapshot,
        bank_cbu_snapshot = excluded.bank_cbu_snapshot,
        bank_alias_snapshot = excluded.bank_alias_snapshot,
        payout_status = case
          when public.event_payouts.payout_status in (
            'completed'::public.event_payout_status,
            'cancelled'::public.event_payout_status,
            'processing'::public.event_payout_status
          ) then public.event_payouts.payout_status
          when public.event_payouts.payout_status = 'hold'::public.event_payout_status
            and public.event_payouts.hold_reason
              = 'CBU/CUIT pendiente de validación o no coincide con el titular.'
            and excluded.payout_status = 'pending_approval'::public.event_payout_status
            then 'pending_approval'::public.event_payout_status
          else public.event_payouts.payout_status
        end,
        hold_reason = case
          when public.event_payouts.payout_status in (
            'completed'::public.event_payout_status,
            'cancelled'::public.event_payout_status
          ) then public.event_payouts.hold_reason
          when public.event_payouts.payout_status = 'hold'::public.event_payout_status
            and public.event_payouts.hold_reason
              = 'CBU/CUIT pendiente de validación o no coincide con el titular.'
            and excluded.payout_status = 'pending_approval'::public.event_payout_status
            then null
          else public.event_payouts.hold_reason
        end
    returning 1
  )
  select count(*) into v_count from upserted;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.sync_event_payouts() from public;
grant execute on function public.sync_event_payouts() to authenticated, service_role;
