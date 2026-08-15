-- P75 Guest checkout anti-fraud: identity caps, IP peek, security log, OTP challenges.

create or replace function public.is_rate_limited(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.rate_limit_buckets%rowtype;
  v_now timestamptz := now();
begin
  if p_bucket_key is null or length(btrim(p_bucket_key)) = 0 then
    return true;
  end if;

  select *
    into v_row
  from public.rate_limit_buckets
  where bucket_key = p_bucket_key;

  if not found then
    return false;
  end if;

  if v_row.window_start + make_interval(secs => greatest(p_window_seconds, 1)) < v_now then
    return false;
  end if;

  return v_row.hit_count >= p_limit;
end;
$$;

revoke all on function public.is_rate_limited(text, integer, integer) from public;
grant execute on function public.is_rate_limited(text, integer, integer)
  to service_role, authenticated;

create or replace function public.count_guest_identity_tickets(
  p_event_id uuid,
  p_holder_dni text,
  p_holder_email text
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.tickets as t
  where t.event_id = p_event_id
    and t.status in ('pending_payment', 'valid', 'used', 'scanned')
    and (
      (
        p_holder_dni is not null
        and length(p_holder_dni) >= 7
        and t.holder_dni = p_holder_dni
      )
      or (
        p_holder_email is not null
        and position('@' in p_holder_email) > 1
        and lower(t.holder_email) = lower(p_holder_email)
      )
    );
$$;

revoke all on function public.count_guest_identity_tickets(uuid, text, text) from public;
grant execute on function public.count_guest_identity_tickets(uuid, text, text)
  to service_role, authenticated;

create table if not exists public.checkout_security_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  event_id uuid,
  buyer_id uuid,
  ip text,
  user_agent text,
  device_hash text,
  dwell_ms integer,
  captcha_provider text,
  captcha_score numeric,
  created_at timestamptz not null default now()
);

create index if not exists checkout_security_events_order_idx
  on public.checkout_security_events (order_id);

create index if not exists checkout_security_events_ip_idx
  on public.checkout_security_events (ip, created_at desc);

alter table public.checkout_security_events enable row level security;

create table if not exists public.guest_access_challenges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  email text not null,
  phone text,
  otp_hash text not null,
  magic_jti text not null unique,
  otp_attempts integer not null default 0,
  verified_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists guest_access_challenges_order_idx
  on public.guest_access_challenges (order_id, created_at desc);

alter table public.guest_access_challenges enable row level security;
