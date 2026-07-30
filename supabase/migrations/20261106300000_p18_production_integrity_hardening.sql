-- =============================================================================
-- P18: Production integrity hardening
-- Prevent impossible All-In rates that collapse net and public price to zero.
-- =============================================================================

update public.profiles
set service_charge_rate = 0.95
where service_charge_rate > 0.95;

alter table public.profiles
  drop constraint if exists profiles_service_charge_rate_check;

alter table public.profiles
  add constraint profiles_service_charge_rate_check
  check (service_charge_rate >= 0 and service_charge_rate <= 0.95);

create or replace function public.all_in_public_price(
  p_base numeric,
  p_rate numeric default 0.15
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    coalesce(p_base, 0)
      / (
        1
        - greatest(0, least(0.95, coalesce(p_rate, 0.15)))
      ),
    2
  );
$$;

create or replace function public.all_in_platform_fee(
  p_base numeric,
  p_rate numeric default 0.15
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    public.all_in_public_price(p_base, p_rate) - coalesce(p_base, 0),
    2
  );
$$;

comment on column public.profiles.service_charge_rate is
  'Porcentaje Tokepass sobre precio público All-In. Rango seguro: 0 a 0.95.';

-- Keep event identity, tiers and seating materialization in one transaction.
create or replace function public.create_complete_event_with_seating_tx(
  payload jsonb,
  p_organizer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or (
         auth.uid() is distinct from p_organizer_id
         and not public.is_super_admin()
       )
     ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.is_approved_organizer(p_organizer_id) then
    raise exception 'ORGANIZER_NOT_APPROVED' using errcode = '42501';
  end if;

  v_event_id := public.create_complete_event_tx(payload, p_organizer_id);
  perform public.configure_event_seating_tiers(
    v_event_id,
    coalesce(payload -> 'tiers', '[]'::jsonb)
  );
  return v_event_id;
end;
$$;

revoke all on function public.create_complete_event_with_seating_tx(jsonb, uuid)
  from public, anon;
grant execute on function public.create_complete_event_with_seating_tx(jsonb, uuid)
  to authenticated, service_role;

create or replace function public.update_complete_event_with_seating_tx(
  p_event_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_organizer_id uuid;
begin
  select e.organizer_id
    into v_organizer_id
  from public.events as e
  where e.id = p_event_id;

  if v_organizer_id is null then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or (
         auth.uid() is distinct from v_organizer_id
         and not public.is_super_admin()
       )
     ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.is_approved_organizer(v_organizer_id) then
    raise exception 'ORGANIZER_NOT_APPROVED' using errcode = '42501';
  end if;

  v_event_id := public.update_complete_event_tx(p_event_id, payload);
  perform public.configure_event_seating_tiers(
    v_event_id,
    coalesce(payload -> 'tiers', '[]'::jsonb)
  );
  return v_event_id;
end;
$$;

revoke all on function public.update_complete_event_with_seating_tx(uuid, jsonb)
  from public, anon;
grant execute on function public.update_complete_event_with_seating_tx(uuid, jsonb)
  to authenticated, service_role;

-- All application writes must pass through the guarded atomic wrappers.
revoke execute on function public.create_complete_event_tx(jsonb, uuid)
  from authenticated;
revoke execute on function public.update_complete_event_tx(uuid, jsonb)
  from authenticated;
revoke execute on function public.configure_event_seating_tiers(uuid, jsonb)
  from authenticated;

-- Aggregate governance metrics in PostgreSQL instead of loading every ticket
-- and order into the Next.js process.
create or replace function public.get_organizer_governance_metrics(
  p_organizer_id uuid
)
returns table (
  total_events bigint,
  published_events bigint,
  tickets_sold bigint,
  historical_gmv numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  select
    (
      select count(*)
      from public.events as e
      where e.organizer_id = p_organizer_id
    ),
    (
      select count(*)
      from public.events as e
      where e.organizer_id = p_organizer_id
        and e.status = 'published'::public.event_status
    ),
    (
      select count(*)
      from public.tickets as t
      join public.events as e on e.id = t.event_id
      where e.organizer_id = p_organizer_id
        and t.status in (
          'valid'::public.ticket_status,
          'transferred'::public.ticket_status,
          'used'::public.ticket_status,
          'scanned'::public.ticket_status
        )
    ),
    (
      select coalesce(sum(o.total_amount), 0)
      from public.orders as o
      where o.status = 'paid'
        and exists (
          select 1
          from public.tickets as t
          join public.events as e on e.id = t.event_id
          where t.order_id = o.id
            and e.organizer_id = p_organizer_id
        )
    );
end;
$$;

revoke all on function public.get_organizer_governance_metrics(uuid)
  from public, anon;
grant execute on function public.get_organizer_governance_metrics(uuid)
  to authenticated, service_role;

create or replace function public.get_platform_global_metrics()
returns table (
  total_gmv numeric,
  platform_revenue numeric,
  total_tickets bigint,
  active_organizers bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  select
    (
      select coalesce(sum(o.total_amount), 0)
      from public.orders as o
      where o.status = 'paid'
    ),
    (
      select coalesce(sum(o.service_charge), 0)
      from public.orders as o
      where o.status = 'paid'
    ),
    (
      select count(*)
      from public.tickets as t
      where t.status in (
        'valid'::public.ticket_status,
        'used'::public.ticket_status,
        'scanned'::public.ticket_status
      )
    ),
    (
      select count(*)
      from public.profiles as p
      where p.role::text = 'admin'
        and p.organizer_approval_status::text = 'approved'
    );
end;
$$;

revoke all on function public.get_platform_global_metrics()
  from public, anon;
grant execute on function public.get_platform_global_metrics()
  to authenticated, service_role;

create table if not exists public.organizer_governance_audit (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (
    action in ('status_update', 'fee_update', 'status_and_fee_update')
  ),
  previous_values jsonb not null,
  new_values jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists organizer_governance_audit_organizer_idx
  on public.organizer_governance_audit(organizer_id, created_at desc);

alter table public.organizer_governance_audit enable row level security;
revoke all on public.organizer_governance_audit from public, anon;
grant select on public.organizer_governance_audit to authenticated;
grant all on public.organizer_governance_audit to service_role;

drop policy if exists organizer_governance_audit_superadmin_select
  on public.organizer_governance_audit;
create policy organizer_governance_audit_superadmin_select
on public.organizer_governance_audit
for select
to authenticated
using (public.is_super_admin());

create or replace function public.update_organizer_governance_tx(
  p_organizer_id uuid,
  p_actor_id uuid,
  p_status text default null,
  p_service_charge_rate numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_action text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as actor
    where actor.id = p_actor_id
      and actor.role::text = 'super_admin'
  ) then
    raise exception 'INVALID_GOVERNANCE_ACTOR' using errcode = '42501';
  end if;

  select *
    into v_profile
  from public.profiles as p
  where p.id = p_organizer_id
    and p.role::text <> 'super_admin'
    and (
      p.role::text = 'admin'
      or p.organizer_approval_status::text <> 'none'
    )
  for update;

  if not found then
    raise exception 'ORGANIZER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_status is null and p_service_charge_rate is null then
    raise exception 'NO_GOVERNANCE_CHANGE' using errcode = '22023';
  end if;
  if p_status is not null
     and p_status not in ('approved', 'rejected', 'suspended') then
    raise exception 'INVALID_ORGANIZER_STATUS' using errcode = '22023';
  end if;
  if p_service_charge_rate is not null
     and (
       p_service_charge_rate < 0
       or p_service_charge_rate > 0.95
     ) then
    raise exception 'INVALID_SERVICE_CHARGE_RATE' using errcode = '22023';
  end if;

  v_action := case
    when p_status is not null and p_service_charge_rate is not null
      then 'status_and_fee_update'
    when p_status is not null then 'status_update'
    else 'fee_update'
  end;

  update public.profiles
  set
    organizer_approval_status = coalesce(
      p_status::public.organizer_approval_status,
      organizer_approval_status
    ),
    service_charge_rate = coalesce(
      round(p_service_charge_rate, 4),
      service_charge_rate
    ),
    role = case
      when p_status = 'approved' then 'admin'::public.user_role
      else role
    end
  where id = p_organizer_id;

  insert into public.organizer_governance_audit (
    organizer_id,
    actor_id,
    action,
    previous_values,
    new_values
  )
  values (
    p_organizer_id,
    p_actor_id,
    v_action,
    jsonb_build_object(
      'status', v_profile.organizer_approval_status,
      'service_charge_rate', v_profile.service_charge_rate,
      'role', v_profile.role
    ),
    jsonb_build_object(
      'status', coalesce(p_status, v_profile.organizer_approval_status::text),
      'service_charge_rate', coalesce(
        round(p_service_charge_rate, 4),
        v_profile.service_charge_rate
      ),
      'role', case
        when p_status = 'approved' then 'admin'
        else v_profile.role::text
      end
    )
  );
end;
$$;

revoke all on function public.update_organizer_governance_tx(
  uuid, uuid, text, numeric
) from public, anon, authenticated;
grant execute on function public.update_organizer_governance_tx(
  uuid, uuid, text, numeric
) to service_role;

create or replace function public.get_platform_organizations_summary()
returns table (
  organizer_id uuid,
  organizer_name text,
  organizer_email text,
  organizer_role text,
  approval_status text,
  service_charge_rate numeric,
  joined_at timestamptz,
  total_events bigint,
  published_events bigint,
  tickets_sold bigint,
  gross_revenue numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  with event_stats as (
    select
      e.organizer_id,
      count(*) as total_events,
      count(*) filter (
        where e.status = 'published'::public.event_status
      ) as published_events
    from public.events as e
    group by e.organizer_id
  ),
  ticket_stats as (
    select
      e.organizer_id,
      count(*) as tickets_sold
    from public.tickets as t
    join public.events as e on e.id = t.event_id
    where t.status in (
      'valid'::public.ticket_status,
      'transferred'::public.ticket_status,
      'used'::public.ticket_status,
      'scanned'::public.ticket_status
    )
    group by e.organizer_id
  ),
  paid_order_organizers as (
    select distinct o.id, o.total_amount, e.organizer_id
    from public.orders as o
    join public.tickets as t on t.order_id = o.id
    join public.events as e on e.id = t.event_id
    where o.status = 'paid'
  ),
  revenue_stats as (
    select
      poo.organizer_id,
      coalesce(sum(poo.total_amount), 0) as gross_revenue
    from paid_order_organizers as poo
    group by poo.organizer_id
  )
  select
    p.id,
    coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre'),
    p.email,
    p.role::text,
    p.organizer_approval_status::text,
    p.service_charge_rate,
    p.created_at,
    coalesce(es.total_events, 0),
    coalesce(es.published_events, 0),
    coalesce(ts.tickets_sold, 0),
    coalesce(rs.gross_revenue, 0)
  from public.profiles as p
  left join event_stats as es on es.organizer_id = p.id
  left join ticket_stats as ts on ts.organizer_id = p.id
  left join revenue_stats as rs on rs.organizer_id = p.id
  where p.role::text <> 'super_admin'
    and (
      p.role::text = 'admin'
      or p.organizer_approval_status::text <> 'none'
    )
  order by p.created_at desc;
end;
$$;

revoke all on function public.get_platform_organizations_summary()
  from public, anon;
grant execute on function public.get_platform_organizations_summary()
  to authenticated, service_role;
