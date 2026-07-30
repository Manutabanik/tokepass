-- =============================================================================
-- Tokepass Boost — destaque pago en portada B2C
-- =============================================================================

alter table public.events
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_tier text,
  add column if not exists featured_until timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_featured_tier_check'
  ) then
    alter table public.events
      add constraint events_featured_tier_check
      check (
        featured_tier is null
        or featured_tier in ('silver', 'gold', 'platinum')
      );
  end if;
end $$;

create index if not exists events_featured_active_idx
  on public.events (featured_until desc, featured_tier)
  where is_featured = true;

create table if not exists public.boost_subscriptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  tier text not null check (tier in ('silver', 'gold', 'platinum')),
  amount_paid numeric(12, 2) not null check (amount_paid >= 0),
  duration_days integer not null check (duration_days > 0),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_id_mp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boost_subscriptions_event_id_idx
  on public.boost_subscriptions (event_id);

create index if not exists boost_subscriptions_organizer_id_idx
  on public.boost_subscriptions (organizer_id);

create index if not exists boost_subscriptions_payment_id_mp_idx
  on public.boost_subscriptions (payment_id_mp)
  where payment_id_mp is not null;

alter table public.boost_subscriptions enable row level security;

drop policy if exists "boost_select_own" on public.boost_subscriptions;
create policy "boost_select_own"
on public.boost_subscriptions
for select
to authenticated
using (
  organizer_id = (select auth.uid())
  or (select public.is_super_admin())
);

drop policy if exists "boost_insert_own" on public.boost_subscriptions;
create policy "boost_insert_own"
on public.boost_subscriptions
for insert
to authenticated
with check (
  organizer_id = (select auth.uid())
  and exists (
    select 1
    from public.events as e
    where e.id = event_id
      and e.organizer_id = (select auth.uid())
  )
);

-- Solo service role / webhook actualiza payment_status
revoke update on public.boost_subscriptions from authenticated;
grant select, insert on public.boost_subscriptions to authenticated;
grant all on public.boost_subscriptions to service_role;

-- Lectura pública de flags de destaque vía consulta de eventos (ya published)
-- Expiración automática a nivel consulta: is_featured AND featured_until > now()
-- Helper para desactivar flags vencidos (opcional, callable por cron)
create or replace function public.expire_featured_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.events
  set
    is_featured = false,
    featured_tier = null,
    updated_at = now()
  where is_featured = true
    and (featured_until is null or featured_until <= now());

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_featured_events() from public;
grant execute on function public.expire_featured_events() to service_role;

comment on column public.events.is_featured is
  'Destaque Tokepass Boost. Solo válido si featured_until > now().';
comment on table public.boost_subscriptions is
  'Compras de destaque Tokepass Boost (Silver/Gold/Platinum).';
