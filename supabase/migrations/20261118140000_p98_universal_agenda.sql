-- P98 · Agenda universal: bloques de actividad opcionales por jornada.
-- events.has_schedule es el interruptor maestro (default false).
-- event_artists / events.lineup no se tocan: el lineup musical sigue igual.

alter table public.events
  add column if not exists has_schedule boolean not null default false;

comment on column public.events.has_schedule is
  'Si es true, el evento publica una agenda de bloques. Default false.';

create table if not exists public.agenda_blocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  day_id uuid references public.event_schedules (id) on delete cascade,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_blocks_title_len check (char_length(btrim(title)) >= 1),
  constraint agenda_blocks_window_check check (end_time > start_time)
);

create index if not exists agenda_blocks_event_day_order_idx
  on public.agenda_blocks (event_id, day_id, sort_order, start_time);

create index if not exists agenda_blocks_day_idx
  on public.agenda_blocks (day_id)
  where day_id is not null;

comment on table public.agenda_blocks is
  'Bloque de agenda (horario + título) de una jornada. El participante es opcional.';
comment on column public.agenda_blocks.day_id is
  'FK a event_schedules. NULL = evento de jornada única / sin jornada relacional.';
comment on column public.agenda_blocks.sort_order is
  'Orden de grilla (drag and drop). Equivale a AgendaBlock.order.';

create table if not exists public.agenda_participants (
  id uuid primary key default gen_random_uuid(),
  agenda_block_id uuid not null references public.agenda_blocks (id) on delete cascade,
  name text not null,
  role_tag text not null default '',
  image_url text,
  external_link text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_participants_name_len check (char_length(btrim(name)) >= 1)
);

create index if not exists agenda_participants_block_order_idx
  on public.agenda_participants (agenda_block_id, sort_order);

comment on table public.agenda_participants is
  'Participante opcional de un bloque (disertante, banda, CEO). 0..N por bloque.';
comment on column public.agenda_participants.role_tag is
  'Etiqueta de rol libre: Disertante, Banda, CEO, etc.';

drop trigger if exists agenda_blocks_set_updated_at on public.agenda_blocks;
create trigger agenda_blocks_set_updated_at
before update on public.agenda_blocks
for each row execute function public.set_updated_at();

drop trigger if exists agenda_participants_set_updated_at on public.agenda_participants;
create trigger agenda_participants_set_updated_at
before update on public.agenda_participants
for each row execute function public.set_updated_at();

create or replace function public.agenda_blocks_day_matches_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.day_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.event_schedules as s
    where s.id = new.day_id
      and s.event_id = new.event_id
  ) then
    raise exception 'agenda_blocks.day_id must belong to the same event'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists agenda_blocks_day_matches_event on public.agenda_blocks;
create trigger agenda_blocks_day_matches_event
before insert or update of event_id, day_id on public.agenda_blocks
for each row execute function public.agenda_blocks_day_matches_event();

alter table public.agenda_blocks enable row level security;
alter table public.agenda_participants enable row level security;

drop policy if exists agenda_blocks_select_visible on public.agenda_blocks;
create policy agenda_blocks_select_visible
  on public.agenda_blocks
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.events as e
      where e.id = agenda_blocks.event_id
        and (
          (
            e.status in (
              'published'::public.event_status,
              'paused'::public.event_status
            )
            and e.visibility in ('public', 'private')
          )
          or e.organizer_id = auth.uid()
          or public.is_super_admin()
        )
    )
  );

drop policy if exists agenda_blocks_insert_owner on public.agenda_blocks;
create policy agenda_blocks_insert_owner
  on public.agenda_blocks
  for insert
  to authenticated
  with check (
    public.is_super_admin()
    or public.owns_event(event_id)
  );

drop policy if exists agenda_blocks_update_owner on public.agenda_blocks;
create policy agenda_blocks_update_owner
  on public.agenda_blocks
  for update
  to authenticated
  using (
    public.is_super_admin()
    or public.owns_event(event_id)
  )
  with check (
    public.is_super_admin()
    or public.owns_event(event_id)
  );

drop policy if exists agenda_blocks_delete_owner on public.agenda_blocks;
create policy agenda_blocks_delete_owner
  on public.agenda_blocks
  for delete
  to authenticated
  using (
    public.is_super_admin()
    or public.owns_event(event_id)
  );

drop policy if exists agenda_participants_select_visible on public.agenda_participants;
create policy agenda_participants_select_visible
  on public.agenda_participants
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.agenda_blocks as b
      join public.events as e on e.id = b.event_id
      where b.id = agenda_participants.agenda_block_id
        and (
          (
            e.status in (
              'published'::public.event_status,
              'paused'::public.event_status
            )
            and e.visibility in ('public', 'private')
          )
          or e.organizer_id = auth.uid()
          or public.is_super_admin()
        )
    )
  );

drop policy if exists agenda_participants_insert_owner on public.agenda_participants;
create policy agenda_participants_insert_owner
  on public.agenda_participants
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.agenda_blocks as b
      where b.id = agenda_participants.agenda_block_id
        and (
          public.is_super_admin()
          or public.owns_event(b.event_id)
        )
    )
  );

drop policy if exists agenda_participants_update_owner on public.agenda_participants;
create policy agenda_participants_update_owner
  on public.agenda_participants
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.agenda_blocks as b
      where b.id = agenda_participants.agenda_block_id
        and (
          public.is_super_admin()
          or public.owns_event(b.event_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.agenda_blocks as b
      where b.id = agenda_participants.agenda_block_id
        and (
          public.is_super_admin()
          or public.owns_event(b.event_id)
        )
    )
  );

drop policy if exists agenda_participants_delete_owner on public.agenda_participants;
create policy agenda_participants_delete_owner
  on public.agenda_participants
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.agenda_blocks as b
      where b.id = agenda_participants.agenda_block_id
        and (
          public.is_super_admin()
          or public.owns_event(b.event_id)
        )
    )
  );

grant select on public.agenda_blocks to anon, authenticated, service_role;
grant insert, update, delete on public.agenda_blocks to authenticated, service_role;

grant select on public.agenda_participants to anon, authenticated, service_role;
grant insert, update, delete on public.agenda_participants to authenticated, service_role;
