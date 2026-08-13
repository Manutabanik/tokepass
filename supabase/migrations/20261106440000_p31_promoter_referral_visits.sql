-- P31: Visitas / clics de referidos RRPP

create table if not exists public.promoter_referral_visits (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references public.promoters (id) on delete cascade,
  referral_code text not null,
  path text,
  event_id uuid references public.events (id) on delete set null,
  visitor_key text,
  created_at timestamptz not null default now()
);

create index if not exists promoter_referral_visits_promoter_id_idx
  on public.promoter_referral_visits (promoter_id);

create index if not exists promoter_referral_visits_created_at_idx
  on public.promoter_referral_visits (created_at desc);

create index if not exists promoter_referral_visits_visitor_dedupe_idx
  on public.promoter_referral_visits (promoter_id, visitor_key, created_at desc);

comment on table public.promoter_referral_visits is
  'Visitas atribuidas a un código ?ref= de promotor (home, landings, ficha).';

alter table public.promoter_referral_visits enable row level security;

drop policy if exists "promoter_referral_visits_select_organizer" on public.promoter_referral_visits;
create policy "promoter_referral_visits_select_organizer"
on public.promoter_referral_visits
for select
to authenticated
using (
  exists (
    select 1
    from public.promoters as p
    where p.id = promoter_referral_visits.promoter_id
      and (
        p.organizer_id = (select auth.uid())
        or p.user_id = (select auth.uid())
        or (select public.is_super_admin())
      )
  )
);

-- Inserts solo vía service role / server action (sin policy insert para authenticated).
revoke insert, update, delete on public.promoter_referral_visits from authenticated, anon;
grant select on public.promoter_referral_visits to authenticated;
grant all on public.promoter_referral_visits to service_role;
