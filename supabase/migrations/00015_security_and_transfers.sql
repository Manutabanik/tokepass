-- =============================================================================
-- Tokepass · Seguridad (schema): límites, totp_secret, transfers, enums
-- Los RPC que USAN los nuevos enum values van en 00016 (mismo TX de ADD VALUE
-- no puede utilizar el label nuevo hasta el commit).
-- =============================================================================

alter type public.ticket_status add value if not exists 'transferred';
alter type public.ticket_status add value if not exists 'used';
alter type public.ticket_status add value if not exists 'cancelled';

alter table public.events
  add column if not exists max_tickets_per_user integer not null default 4
    check (max_tickets_per_user > 0);

alter table public.tickets
  add column if not exists max_transfers_allowed integer not null default 1
    check (max_transfers_allowed >= 0);

alter table public.tickets
  add column if not exists transfer_count integer not null default 0
    check (transfer_count >= 0);

alter table public.tickets
  add column if not exists totp_secret text;

update public.tickets
set totp_secret = id::text
where totp_secret is null;

alter table public.tickets
  alter column totp_secret set not null;

alter table public.tickets
  alter column totp_secret set default encode(extensions.gen_random_bytes(24), 'hex');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tickets_totp_secret_key'
  ) then
    alter table public.tickets
      add constraint tickets_totp_secret_key unique (totp_secret);
  end if;
end;
$$;

alter table public.tickets
  alter column owner_id drop not null;

create index if not exists tickets_totp_secret_idx
  on public.tickets (totp_secret);

create index if not exists tickets_event_owner_status_idx
  on public.tickets (event_id, owner_id, status);

create table if not exists public.ticket_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  receiver_email text not null,
  original_ticket_id uuid not null references public.tickets(id) on delete restrict,
  new_ticket_id uuid references public.tickets(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ticket_transfers_receiver_email_check
    check (length(btrim(receiver_email)) > 3)
);

create index if not exists ticket_transfers_sender_id_idx
  on public.ticket_transfers (sender_id);

create index if not exists ticket_transfers_receiver_email_idx
  on public.ticket_transfers (lower(receiver_email));

create index if not exists ticket_transfers_original_ticket_id_idx
  on public.ticket_transfers (original_ticket_id);

alter table public.ticket_transfers enable row level security;

drop policy if exists "ticket_transfers_select_involved" on public.ticket_transfers;

create policy "ticket_transfers_select_involved"
on public.ticket_transfers
for select
to authenticated
using (
  sender_id = (select auth.uid())
  or (select public.is_super_admin())
  or exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and lower(p.email) = lower(ticket_transfers.receiver_email)
  )
  or exists (
    select 1
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.id = ticket_transfers.original_ticket_id
      and e.organizer_id = (select auth.uid())
  )
);
