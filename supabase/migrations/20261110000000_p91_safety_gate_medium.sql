-- =============================================================================
-- P91 - Safety Gate medium: public seating occupancy + webhook claim TX
-- =============================================================================

-- -----------------------------------------------------------------------------
-- M1: occupancy replica without reserved_by / reserved_order_id
-- -----------------------------------------------------------------------------
create table if not exists public.event_seating_occupancy (
  id uuid primary key
    references public.event_seating_units(id) on delete cascade,
  event_id uuid not null,
  status text not null,
  seating_sector_id text not null,
  layout_item_id text not null
);

comment on table public.event_seating_occupancy is
  'Replica publica de ocupacion: id, event_id, status, sector y layout. Sin PII de holds.';

create index if not exists event_seating_occupancy_event_idx
  on public.event_seating_occupancy (event_id);

create or replace function public.sync_event_seating_occupancy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.event_seating_occupancy where id = old.id;
    return old;
  end if;

  insert into public.event_seating_occupancy as occ (
    id,
    event_id,
    status,
    seating_sector_id,
    layout_item_id
  )
  values (
    new.id,
    new.event_id,
    new.status,
    new.sector_id,
    new.layout_item_id
  )
  on conflict (id) do update
    set event_id = excluded.event_id,
        status = excluded.status,
        seating_sector_id = excluded.seating_sector_id,
        layout_item_id = excluded.layout_item_id;

  return new;
end;
$$;

drop trigger if exists event_seating_units_occupancy_sync
  on public.event_seating_units;
create trigger event_seating_units_occupancy_sync
after insert or update of event_id, status, sector_id, layout_item_id or delete
on public.event_seating_units
for each row
execute function public.sync_event_seating_occupancy();

insert into public.event_seating_occupancy (
  id,
  event_id,
  status,
  seating_sector_id,
  layout_item_id
)
select
  u.id,
  u.event_id,
  u.status,
  u.sector_id,
  u.layout_item_id
from public.event_seating_units as u
on conflict (id) do update
  set event_id = excluded.event_id,
      status = excluded.status,
      seating_sector_id = excluded.seating_sector_id,
      layout_item_id = excluded.layout_item_id;

alter table public.event_seating_occupancy enable row level security;

revoke all on table public.event_seating_occupancy from public;
revoke all on table public.event_seating_occupancy from anon;
revoke all on table public.event_seating_occupancy from authenticated;
grant select on table public.event_seating_occupancy to anon, authenticated;
grant all on table public.event_seating_occupancy to service_role;

drop policy if exists event_seating_occupancy_public_read
  on public.event_seating_occupancy;
create policy event_seating_occupancy_public_read
  on public.event_seating_occupancy
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.events as e
      where e.id = event_seating_occupancy.event_id
        and e.status = 'published'
        and e.visibility = 'public'
    )
  );

drop policy if exists event_seating_units_public_occupancy
  on public.event_seating_units;

drop policy if exists event_seating_units_organizer_select
  on public.event_seating_units;
drop policy if exists event_seating_units_owner_select
  on public.event_seating_units;
create policy event_seating_units_owner_select
  on public.event_seating_units
  for select
  to authenticated
  using (
    reserved_by = auth.uid()
    or exists (
      select 1
      from public.events as e
      where e.id = event_seating_units.event_id
        and e.organizer_id = auth.uid()
    )
    or (select public.is_super_admin())
    or exists (
      select 1
      from public.event_staff_assignments as a
      where a.event_id = event_seating_units.event_id
        and a.user_id = auth.uid()
        and a.is_active is true
        and (a.expires_at is null or a.expires_at > now())
    )
  );

revoke select on public.event_seating_units from anon;
grant select on public.event_seating_units to authenticated;

alter table public.event_seating_units replica identity default;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_seating_units'
  ) then
    alter publication supabase_realtime drop table public.event_seating_units;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_seating_occupancy'
  ) then
    alter publication supabase_realtime add table public.event_seating_occupancy;
  end if;
end $$;

create or replace view public.event_seating_occupancy_view
  with (security_invoker = true)
as
select
  id,
  event_id,
  status,
  seating_sector_id,
  layout_item_id
from public.event_seating_occupancy;

grant select on public.event_seating_occupancy_view to anon, authenticated;

-- -----------------------------------------------------------------------------
-- M3: claim webhook ledger and finalize in the same transaction
-- -----------------------------------------------------------------------------
create or replace function public.claim_and_finalize_paid_order(
  p_order_id uuid,
  p_provider text,
  p_transaction_id text,
  p_event_type text default 'payment.approved',
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_inserted uuid;
  v_result jsonb;
  v_provider public.payment_provider_type;
  v_tx text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_tx := nullif(btrim(coalesce(p_transaction_id, '')), '');
  if p_order_id is null or v_tx is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_args');
  end if;

  begin
    v_provider := btrim(coalesce(p_provider, ''))::public.payment_provider_type;
  exception
    when invalid_text_representation then
      return jsonb_build_object('ok', false, 'code', 'invalid_provider');
  end;

  insert into public.payment_webhook_events (
    provider,
    external_event_id,
    event_type,
    payload
  )
  values (
    v_provider,
    v_tx,
    coalesce(nullif(btrim(coalesce(p_event_type, '')), ''), 'payment.approved'),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, external_event_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return jsonb_build_object(
      'ok', true,
      'code', 'already_processed',
      'idempotent', true
    );
  end if;

  v_result := public.finalize_paid_order(
    p_order_id,
    p_provider,
    v_tx,
    coalesce(p_payload, '{}'::jsonb)
  );

  return coalesce(
    v_result,
    jsonb_build_object('ok', false, 'code', 'finalize_failed')
  );
end;
$$;

comment on function public.claim_and_finalize_paid_order(uuid, text, text, text, jsonb) is
  'Inserta payment_webhook_events y ejecuta finalize_paid_order en la misma transaccion.';

revoke all on function public.claim_and_finalize_paid_order(uuid, text, text, text, jsonb)
  from public;
grant execute on function public.claim_and_finalize_paid_order(uuid, text, text, text, jsonb)
  to service_role;
