-- P128 · security_audit_log append-only + triggers de inmutabilidad

create table if not exists public.security_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  ip inet,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists security_audit_log_actor_idx
  on public.security_audit_log (actor_id, created_at desc);

create index if not exists security_audit_log_entity_idx
  on public.security_audit_log (entity, entity_id, created_at desc);

comment on table public.security_audit_log is
  'Trail centralizado de acciones admin. Append-only: UPDATE/DELETE prohibidos.';

alter table public.security_audit_log enable row level security;
revoke all on table public.security_audit_log from public, anon, authenticated;
grant select on table public.security_audit_log to authenticated;
grant insert, select on table public.security_audit_log to service_role;

drop policy if exists security_audit_log_superadmin_select
  on public.security_audit_log;
create policy security_audit_log_superadmin_select
on public.security_audit_log
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'super_admin'
  )
);

create or replace function public.write_security_audit_log(
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_ip text default null,
  p_user_agent text default null,
  p_details jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid;
  v_ip inet;
  v_id uuid;
  v_action text := nullif(btrim(coalesce(p_action, '')), '');
  v_entity text := nullif(btrim(coalesce(p_entity, '')), '');
begin
  if v_action is null or v_entity is null then
    raise exception 'invalid_audit_event' using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    v_actor := p_actor_id;
  else
    v_actor := auth.uid();
  end if;

  begin
    v_ip := nullif(btrim(coalesce(p_ip, '')), '')::inet;
  exception
    when invalid_text_representation then
      v_ip := null;
  end;

  insert into public.security_audit_log (
    actor_id,
    action,
    entity,
    entity_id,
    ip,
    user_agent,
    details
  )
  values (
    v_actor,
    left(v_action, 80),
    left(v_entity, 80),
    p_entity_id,
    v_ip,
    nullif(left(btrim(coalesce(p_user_agent, '')), 512), ''),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.write_security_audit_log(text, text, uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.write_security_audit_log(text, text, uuid, text, text, jsonb, uuid)
  to service_role;

create or replace function public.forbid_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log_is_immutable';
end;
$$;

drop trigger if exists security_audit_log_no_mut on public.security_audit_log;
create trigger security_audit_log_no_mut
  before update or delete on public.security_audit_log
  for each row execute function public.forbid_audit_mutation();

drop trigger if exists event_sku_changelog_no_mut on public.event_sku_changelog;
create trigger event_sku_changelog_no_mut
  before update or delete on public.event_sku_changelog
  for each row execute function public.forbid_audit_mutation();

drop trigger if exists platform_ops_audit_no_mut on public.platform_ops_audit;
create trigger platform_ops_audit_no_mut
  before update or delete on public.platform_ops_audit
  for each row execute function public.forbid_audit_mutation();

drop trigger if exists organizer_governance_audit_no_mut
  on public.organizer_governance_audit;
create trigger organizer_governance_audit_no_mut
  before update or delete on public.organizer_governance_audit
  for each row execute function public.forbid_audit_mutation();

revoke update, delete on table public.security_audit_log from service_role;
revoke update, delete on table public.event_sku_changelog from service_role;
revoke update, delete on table public.platform_ops_audit from service_role;
revoke update, delete on table public.organizer_governance_audit from service_role;
