-- =============================================================================
-- P21: Organizer financial risk matrix + mass refund engine (super_admin only)
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'organizer_risk_tier'
  ) then
    create type public.organizer_risk_tier as enum (
      'TIER_1_CUSTODY',
      'TIER_2_INSTANT_SPLIT',
      'TIER_3_ENTERPRISE'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'organizer_guarantee_status'
  ) then
    create type public.organizer_guarantee_status as enum (
      'NONE',
      'PROMISSORY_NOTE_SIGNED',
      'INSURANCE_BOND_ACTIVE'
    );
  end if;
end
$$;

alter table public.profiles
  add column if not exists risk_tier public.organizer_risk_tier
    not null default 'TIER_1_CUSTODY'::public.organizer_risk_tier,
  add column if not exists guarantee_status public.organizer_guarantee_status
    not null default 'NONE'::public.organizer_guarantee_status;

comment on column public.profiles.risk_tier is
  'Matriz de riesgo financiero: custodia Tokepass vs split MP Connect.';
comment on column public.profiles.guarantee_status is
  'Respaldo legal ante cancelaciones (pagaré / seguro).';
comment on column public.profiles.service_charge_rate is
  'Comisión Tokepass (custom_commission_rate canónica). 0.15 = 15%.';

-- MP Connect credentials MUST NOT live on profiles: authenticated SELECT
-- policies return full rows and would leak access tokens.
create table if not exists public.organizer_mp_connect (
  organizer_id uuid primary key
    references public.profiles(id) on delete cascade,
  mp_user_id text,
  access_token text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connected', 'revoked', 'error')),
  connected_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.organizer_mp_connect enable row level security;
revoke all on public.organizer_mp_connect from public, anon, authenticated;
grant all on public.organizer_mp_connect to service_role;

-- Organizers can still only update full_name; financial columns stay locked.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

alter table public.orders
  drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'failed', 'expired', 'refunded'));

create table if not exists public.platform_ops_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  event_id uuid references public.events(id) on delete set null,
  organizer_id uuid references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_ops_audit_created_idx
  on public.platform_ops_audit (created_at desc);
create index if not exists platform_ops_audit_event_idx
  on public.platform_ops_audit (event_id, created_at desc);

alter table public.platform_ops_audit enable row level security;
revoke all on public.platform_ops_audit from public, anon, authenticated;
grant select on public.platform_ops_audit to authenticated;
grant all on public.platform_ops_audit to service_role;

drop policy if exists platform_ops_audit_superadmin_select
  on public.platform_ops_audit;
create policy platform_ops_audit_superadmin_select
on public.platform_ops_audit
for select
to authenticated
using (public.is_super_admin());

alter table public.organizer_governance_audit
  drop constraint if exists organizer_governance_audit_action_check;
alter table public.organizer_governance_audit
  add constraint organizer_governance_audit_action_check
  check (
    action in (
      'status_update',
      'fee_update',
      'status_and_fee_update',
      'risk_matrix_update',
      'legal_identity_update'
    )
  );

-- -----------------------------------------------------------------------------
-- SuperAdmin-only: update risk matrix (tier / guarantee / MP Connect / fee)
-- -----------------------------------------------------------------------------
create or replace function public.update_organizer_risk_matrix_tx(
  p_organizer_id uuid,
  p_actor_id uuid,
  p_risk_tier text default null,
  p_guarantee_status text default null,
  p_service_charge_rate numeric default null,
  p_mp_user_id text default null,
  p_mp_access_token text default null,
  p_clear_mp_access_token boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_connect public.organizer_mp_connect%rowtype;
  v_next_mp_user_id text;
  v_has_token boolean;
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

  select *
    into v_connect
  from public.organizer_mp_connect as c
  where c.organizer_id = p_organizer_id
  for update;

  if p_risk_tier is not null
     and p_risk_tier not in (
       'TIER_1_CUSTODY',
       'TIER_2_INSTANT_SPLIT',
       'TIER_3_ENTERPRISE'
     ) then
    raise exception 'INVALID_RISK_TIER' using errcode = '22023';
  end if;

  if p_guarantee_status is not null
     and p_guarantee_status not in (
       'NONE',
       'PROMISSORY_NOTE_SIGNED',
       'INSURANCE_BOND_ACTIVE'
     ) then
    raise exception 'INVALID_GUARANTEE_STATUS' using errcode = '22023';
  end if;

  if p_service_charge_rate is not null
     and (
       p_service_charge_rate < 0
       or p_service_charge_rate > 0.95
     ) then
    raise exception 'INVALID_SERVICE_CHARGE_RATE' using errcode = '22023';
  end if;

  update public.profiles
  set
    risk_tier = coalesce(
      p_risk_tier::public.organizer_risk_tier,
      risk_tier
    ),
    guarantee_status = coalesce(
      p_guarantee_status::public.organizer_guarantee_status,
      guarantee_status
    ),
    service_charge_rate = coalesce(
      round(p_service_charge_rate, 4),
      service_charge_rate
    ),
    updated_at = now()
  where id = p_organizer_id;

  v_next_mp_user_id := case
    when p_mp_user_id is null then v_connect.mp_user_id
    else nullif(btrim(p_mp_user_id), '')
  end;

  if p_clear_mp_access_token
     or p_mp_access_token is not null
     or p_mp_user_id is not null then
    insert into public.organizer_mp_connect as c (
      organizer_id,
      mp_user_id,
      access_token,
      status,
      connected_at,
      revoked_at,
      updated_at
    )
    values (
      p_organizer_id,
      v_next_mp_user_id,
      case
        when p_clear_mp_access_token then null
        when p_mp_access_token is null then null
        else nullif(btrim(p_mp_access_token), '')
      end,
      case
        when p_clear_mp_access_token then 'revoked'
        when nullif(btrim(coalesce(p_mp_access_token, '')), '') is not null
          or v_next_mp_user_id is not null
          then 'connected'
        else 'disconnected'
      end,
      case
        when p_clear_mp_access_token then null
        when nullif(btrim(coalesce(p_mp_access_token, '')), '') is not null
          or v_next_mp_user_id is not null
          then now()
        else null
      end,
      case when p_clear_mp_access_token then now() else null end,
      now()
    )
    on conflict (organizer_id) do update
    set
      mp_user_id = excluded.mp_user_id,
      access_token = case
        when p_clear_mp_access_token then null
        when p_mp_access_token is null then c.access_token
        else nullif(btrim(p_mp_access_token), '')
      end,
      status = case
        when p_clear_mp_access_token then 'revoked'
        when (
          case
            when p_mp_access_token is null then c.access_token
            else nullif(btrim(p_mp_access_token), '')
          end
        ) is not null
          or excluded.mp_user_id is not null
          then 'connected'
        else 'disconnected'
      end,
      connected_at = case
        when p_clear_mp_access_token then null
        when c.connected_at is not null then c.connected_at
        else now()
      end,
      revoked_at = case
        when p_clear_mp_access_token then now()
        else null
      end,
      updated_at = now();
  end if;

  select (c.access_token is not null)
    into v_has_token
  from public.organizer_mp_connect as c
  where c.organizer_id = p_organizer_id;

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
    'risk_matrix_update',
    jsonb_build_object(
      'risk_tier', v_profile.risk_tier,
      'guarantee_status', v_profile.guarantee_status,
      'service_charge_rate', v_profile.service_charge_rate,
      'mp_user_id', v_connect.mp_user_id,
      'has_mp_access_token', v_connect.access_token is not null
    ),
    jsonb_build_object(
      'risk_tier', coalesce(p_risk_tier, v_profile.risk_tier::text),
      'guarantee_status', coalesce(
        p_guarantee_status,
        v_profile.guarantee_status::text
      ),
      'service_charge_rate', coalesce(
        round(p_service_charge_rate, 4),
        v_profile.service_charge_rate
      ),
      'mp_user_id', v_next_mp_user_id,
      'has_mp_access_token', coalesce(v_has_token, false)
    )
  );
end;
$$;

revoke all on function public.update_organizer_risk_matrix_tx(
  uuid, uuid, text, text, numeric, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.update_organizer_risk_matrix_tx(
  uuid, uuid, text, text, numeric, text, text, boolean
) to service_role;

-- -----------------------------------------------------------------------------
-- Atomic mass refund preparation (DB side). MP API runs in app layer after.
-- -----------------------------------------------------------------------------
create or replace function public.execute_mass_event_refund_tx(
  p_event_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns table (
  order_id uuid,
  mp_payment_id text,
  total_amount numeric,
  risk_tier text,
  organizer_id uuid,
  tickets_cancelled integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_organizer public.profiles%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_order_id uuid;
  v_mp_payment_id text;
  v_total_amount numeric;
  v_ticket_count integer := 0;
  v_orders_count integer := 0;
  v_total_tickets integer := 0;
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
    insert into public.platform_ops_audit (
      actor_id,
      action,
      event_id,
      reason,
      metadata
    )
    values (
      p_actor_id,
      'MASS_REFUND_UNAUTHORIZED',
      p_event_id,
      v_reason,
      jsonb_build_object('blocked', true)
    );
    raise exception 'INVALID_GOVERNANCE_ACTOR' using errcode = '42501';
  end if;

  if v_reason is null or char_length(v_reason) < 8 then
    raise exception 'REFUND_REASON_REQUIRED' using errcode = '22023';
  end if;

  select *
    into v_event
  from public.events as e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
    into v_organizer
  from public.profiles as p
  where p.id = v_event.organizer_id
  for update;

  if not found then
    raise exception 'ORGANIZER_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.events as e
  set
    status = 'cancelled'::public.event_status,
    updated_at = now()
  where e.id = p_event_id;

  for v_order_id, v_mp_payment_id, v_total_amount in
    select distinct o.id, o.mp_payment_id, o.total_amount
    from public.orders as o
    where o.status = 'paid'
      and exists (
        select 1
        from public.tickets as t
        where t.order_id = o.id
          and t.event_id = p_event_id
      )
  loop
    update public.tickets as t
    set
      status = 'cancelled'::public.ticket_status,
      updated_at = now()
    where t.order_id = v_order_id
      and t.event_id = p_event_id
      and t.status::text in (
        'valid',
        'pending_payment',
        'used',
        'scanned'
      );

    get diagnostics v_ticket_count = row_count;
    v_total_tickets := v_total_tickets + coalesce(v_ticket_count, 0);

    update public.orders as o
    set
      status = 'refunded',
      updated_at = now()
    where o.id = v_order_id
      and o.status = 'paid';

    v_orders_count := v_orders_count + 1;

    order_id := v_order_id;
    mp_payment_id := v_mp_payment_id;
    total_amount := v_total_amount;
    risk_tier := v_organizer.risk_tier::text;
    organizer_id := v_organizer.id;
    tickets_cancelled := coalesce(v_ticket_count, 0);
    return next;
  end loop;

  insert into public.platform_ops_audit (
    actor_id,
    action,
    event_id,
    organizer_id,
    reason,
    metadata
  )
  values (
    p_actor_id,
    'MASS_REFUND_TRIGGERED',
    p_event_id,
    v_organizer.id,
    v_reason,
    jsonb_build_object(
      'orders_refunded', v_orders_count,
      'tickets_cancelled', v_total_tickets,
      'risk_tier', v_organizer.risk_tier,
      'event_title', v_event.title
    )
  );
end;
$$;

revoke all on function public.execute_mass_event_refund_tx(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.execute_mass_event_refund_tx(uuid, uuid, text)
  to service_role;
