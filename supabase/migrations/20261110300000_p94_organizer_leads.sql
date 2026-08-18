-- =============================================================================
-- P94: organizer_leads — captación B2B pública (sin autorregistro)
-- =============================================================================

create table if not exists public.organizer_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  event_name text not null,
  estimated_attendance integer not null,
  created_at timestamptz not null default now(),
  constraint organizer_leads_full_name_len
    check (char_length(btrim(full_name)) between 2 and 120),
  constraint organizer_leads_email_len
    check (char_length(btrim(email)) between 5 and 160),
  constraint organizer_leads_phone_len
    check (char_length(btrim(phone)) between 8 and 24),
  constraint organizer_leads_event_name_len
    check (char_length(btrim(event_name)) between 2 and 160),
  constraint organizer_leads_attendance_range
    check (estimated_attendance between 1 and 200000)
);

create index if not exists organizer_leads_created_at_idx
  on public.organizer_leads (created_at desc);

create index if not exists organizer_leads_email_idx
  on public.organizer_leads (lower(email));

comment on table public.organizer_leads is
  'Solicitudes de acceso B2B desde /organizadores. Inserta solo service_role.';

alter table public.organizer_leads enable row level security;

revoke all on table public.organizer_leads from public, anon, authenticated;
grant select, insert on table public.organizer_leads to service_role;
