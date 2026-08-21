-- =============================================================================
-- TokePass Booster Engine — planes Flash / PRO / VIP sobre el Boost existente
-- No toca el checkout de entradas. is_featured / featured_until ya existen.
-- =============================================================================

alter table public.events
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_until timestamptz,
  add column if not exists storefront_views integer not null default 0;

alter table public.events
  alter column storefront_views set default 0;

update public.events
set storefront_views = 0
where storefront_views is null;

alter table public.boost_subscriptions
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.events drop constraint if exists events_featured_tier_check;
alter table public.events
  add constraint events_featured_tier_check
  check (
    featured_tier is null
    or featured_tier in (
      'silver',
      'gold',
      'platinum',
      'flash_3d',
      'pro_7d',
      'vip_total'
    )
  );

alter table public.boost_subscriptions drop constraint if exists boost_subscriptions_tier_check;
alter table public.boost_subscriptions
  add constraint boost_subscriptions_tier_check
  check (
    tier in (
      'silver',
      'gold',
      'platinum',
      'flash_3d',
      'pro_7d',
      'vip_total'
    )
  );

create or replace function public.activate_paid_boost(
  p_subscription_id uuid,
  p_payment_id text,
  p_featured_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_boost public.boost_subscriptions%rowtype;
  v_event public.events%rowtype;
  v_repaired boolean := false;
  v_activated boolean := false;
  v_ends timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_subscription_id is null or nullif(btrim(p_payment_id), '') is null then
    raise exception 'Parámetros inválidos' using errcode = '22023';
  end if;

  select * into v_boost
  from public.boost_subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'boost_not_found');
  end if;

  v_ends := coalesce(
    p_featured_until,
    now() + (v_boost.duration_days || ' days')::interval
  );

  if v_boost.payment_status = 'pending' then
    update public.boost_subscriptions
    set
      payment_status = 'paid',
      payment_id_mp = p_payment_id,
      starts_at = coalesce(starts_at, now()),
      ends_at = v_ends,
      updated_at = now()
    where id = v_boost.id
      and payment_status = 'pending';

    if not found then
      select * into v_boost
      from public.boost_subscriptions
      where id = p_subscription_id;
    else
      v_activated := true;
      select * into v_boost
      from public.boost_subscriptions
      where id = p_subscription_id;
    end if;
  end if;

  if v_boost.payment_status <> 'paid' then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_paid',
      'payment_status', v_boost.payment_status
    );
  end if;

  if v_boost.starts_at is null or v_boost.ends_at is null then
    update public.boost_subscriptions
    set
      starts_at = coalesce(starts_at, now()),
      ends_at = coalesce(ends_at, v_ends),
      payment_id_mp = coalesce(payment_id_mp, p_payment_id),
      updated_at = now()
    where id = v_boost.id;
  end if;

  select * into v_event
  from public.events
  where id = v_boost.event_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'event_not_found');
  end if;

  if coalesce(v_event.is_featured, false) = false
     or v_event.featured_until is null
     or v_event.featured_until < now()
     or v_event.featured_tier is distinct from v_boost.tier
     or (
       p_featured_until is not null
       and (
         v_event.featured_until is null
         or v_event.featured_until < p_featured_until
       )
     )
  then
    update public.events
    set
      is_featured = true,
      featured_tier = v_boost.tier,
      featured_until = coalesce(p_featured_until, v_ends),
      updated_at = now()
    where id = v_event.id;

    v_repaired := not v_activated;
  end if;

  if v_boost.payment_id_mp is distinct from p_payment_id then
    update public.boost_subscriptions
    set
      payment_id_mp = coalesce(payment_id_mp, p_payment_id),
      updated_at = now()
    where id = v_boost.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'activated', v_activated,
    'repaired', v_repaired,
    'event_id', v_boost.event_id,
    'tier', v_boost.tier
  );
end;
$$;

revoke all on function public.activate_paid_boost(uuid, text, timestamptz) from public;
grant execute on function public.activate_paid_boost(uuid, text, timestamptz)
  to service_role;

create or replace function public.increment_event_storefront_views(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_id is null then
    return;
  end if;

  update public.events
  set storefront_views = coalesce(storefront_views, 0) + 1
  where id = p_event_id
    and status = 'published';
end;
$$;

revoke all on function public.increment_event_storefront_views(uuid) from public;
grant execute on function public.increment_event_storefront_views(uuid)
  to service_role;

create or replace view public.event_boosts
with (security_invoker = true) as
select
  s.id,
  s.event_id,
  s.tier as plan_type,
  s.amount_paid as amount,
  case
    when s.payment_status = 'paid'
      and coalesce(s.ends_at, e.featured_until) is not null
      and coalesce(s.ends_at, e.featured_until) <= now()
      then 'expired'
    when s.payment_status = 'paid' then 'approved'
    when s.payment_status = 'pending' then 'pending'
    else s.payment_status
  end as status,
  coalesce(s.starts_at, s.created_at) as starts_at,
  coalesce(s.ends_at, e.featured_until) as ends_at,
  s.payment_id_mp as payment_id,
  s.created_at
from public.boost_subscriptions as s
left join public.events as e
  on e.id = s.event_id;

grant select on public.event_boosts to authenticated;
grant select on public.event_boosts to service_role;

comment on view public.event_boosts is
  'Lectura de pautas del Booster Engine. La fuente de pago es boost_subscriptions.';
comment on column public.events.storefront_views is
  'Visitas a la ficha publica. Lo incrementa el storefront publicado.';
