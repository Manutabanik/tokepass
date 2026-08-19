-- =============================================================================
-- P106: chat de soporte interno + rechazo de evento
-- Torre de control Superadmin. Sin plazos fijos.
-- =============================================================================

alter type public.event_status add value if not exists 'rejected';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'support_thread_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.support_thread_status as enum (
      'open',
      'resolved',
      'pending_admin'
    );
  end if;
end
$$;

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  status public.support_thread_status not null default 'open',
  last_message_preview text,
  last_message_is_admin boolean not null default false,
  last_admin_read_at timestamptz,
  last_organizer_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists support_threads_general_uidx
  on public.support_threads (organizer_id)
  where event_id is null;

create unique index if not exists support_threads_event_uidx
  on public.support_threads (organizer_id, event_id)
  where event_id is not null;

create index if not exists support_threads_updated_idx
  on public.support_threads (updated_at desc);

create index if not exists support_threads_pending_admin_idx
  on public.support_threads (updated_at desc)
  where status = 'pending_admin';

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  is_admin boolean not null default false,
  content text not null,
  created_at timestamptz not null default now(),
  constraint support_messages_content_len check (
    char_length(btrim(content)) between 1 and 4000
  )
);

create index if not exists support_messages_thread_created_idx
  on public.support_messages (thread_id, created_at);

create or replace function public.touch_support_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.support_threads
  set
    updated_at = now(),
    last_message_preview = left(btrim(new.content), 160),
    last_message_is_admin = new.is_admin,
    status = case
      when new.is_admin then 'open'::public.support_thread_status
      else 'pending_admin'::public.support_thread_status
    end
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists support_messages_touch_thread on public.support_messages;
create trigger support_messages_touch_thread
after insert on public.support_messages
for each row execute function public.touch_support_thread_on_message();

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists support_threads_select on public.support_threads;
create policy support_threads_select
on public.support_threads
for select
to authenticated
using (
  organizer_id = (select auth.uid())
  or public.is_super_admin()
);

drop policy if exists support_threads_insert on public.support_threads;
create policy support_threads_insert
on public.support_threads
for insert
to authenticated
with check (
  (
    organizer_id = (select auth.uid())
    and public.is_approved_organizer((select auth.uid()))
  )
  or public.is_super_admin()
);

drop policy if exists support_threads_update on public.support_threads;
create policy support_threads_update
on public.support_threads
for update
to authenticated
using (
  organizer_id = (select auth.uid())
  or public.is_super_admin()
)
with check (
  organizer_id = (select auth.uid())
  or public.is_super_admin()
);

drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select
on public.support_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_threads as t
    where t.id = thread_id
      and (
        t.organizer_id = (select auth.uid())
        or public.is_super_admin()
      )
  )
);

drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert
on public.support_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.support_threads as t
    where t.id = thread_id
      and (
        (
          t.organizer_id = (select auth.uid())
          and not is_admin
        )
        or public.is_super_admin()
      )
  )
);

alter table public.support_threads replica identity full;
alter table public.support_messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_threads'
  ) then
    alter publication supabase_realtime add table public.support_threads;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end
$$;

create or replace function public.event_preview_key_matches(
  p_event_id uuid,
  p_key uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and e.preview_key = p_key
      and e.status::text in (
        'draft',
        'pending_approval',
        'needs_revision',
        'rejected'
      )
  );
$$;
