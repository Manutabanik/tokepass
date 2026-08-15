-- P77 Archive flag for organizer venues (hide from event venue dropdown).

alter table public.venues
  add column if not exists is_archived boolean not null default false;

create index if not exists venues_organizer_archived_name_idx
  on public.venues (organizer_id, is_archived, name);
