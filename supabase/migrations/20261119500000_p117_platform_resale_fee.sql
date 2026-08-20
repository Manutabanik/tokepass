-- =============================================================================
-- Tokepass · P117 · Comisión de reventa configurable (platform_settings)
-- =============================================================================

create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  resale_fee_percentage numeric(5, 2) not null default 10
    check (
      resale_fee_percentage >= 0
      and resale_fee_percentage <= 100
    ),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.platform_settings (id, resale_fee_percentage)
values (1, 10)
on conflict (id) do nothing;

drop trigger if exists platform_settings_set_updated_at on public.platform_settings;
create trigger platform_settings_set_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_select_public on public.platform_settings;
create policy platform_settings_select_public
  on public.platform_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists platform_settings_update_superadmin on public.platform_settings;
create policy platform_settings_update_superadmin
  on public.platform_settings
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;

comment on table public.platform_settings is
  'Singleton de configuracion global de la plataforma (id = 1).';
comment on column public.platform_settings.resale_fee_percentage is
  'Porcentaje de costo administrativo descontado al vendedor en reventa oficial.';

create or replace function public.get_resale_fee_percentage()
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select s.resale_fee_percentage
      from public.platform_settings as s
      where s.id = 1
    ),
    10
  );
$$;

revoke all on function public.get_resale_fee_percentage() from public;
grant execute on function public.get_resale_fee_percentage()
  to anon, authenticated;

comment on function public.get_resale_fee_percentage() is
  'Devuelve el porcentaje vigente de comision de reventa (default 10).';

create or replace function public.create_resale_listing(
  p_ticket_id uuid,
  p_terms_version text
)
returns table (
  listing_id uuid,
  ticket_id uuid,
  event_id uuid,
  price numeric,
  status public.ticket_resale_listing_status,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_seller uuid := auth.uid();
  v_ticket public.tickets%rowtype;
  v_tier_price numeric;
  v_price numeric;
  v_fee_pct numeric;
  v_fee numeric;
  v_net numeric;
  v_secret text;
  v_listing public.ticket_resale_listings%rowtype;
begin
  if v_seller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if btrim(coalesce(p_terms_version, '')) = '' then
    raise exception 'CONSENT_REQUIRED' using errcode = '23514';
  end if;

  select *
    into v_ticket
  from public.tickets as t
  where t.id = p_ticket_id
  for update of t;

  if not found then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ticket.owner_id is distinct from v_seller then
    raise exception 'NOT_TICKET_OWNER' using errcode = '42501';
  end if;
  if v_ticket.status::text <> 'valid' then
    raise exception 'TICKET_NOT_TRANSFERABLE' using errcode = '23514';
  end if;
  if coalesce(v_ticket.is_test, false) then
    raise exception 'TICKET_IS_TEST' using errcode = '23514';
  end if;
  if coalesce(v_ticket.admissions_used, 0) > 0 then
    raise exception 'TICKET_ALREADY_ADMITTED' using errcode = '23514';
  end if;
  if v_ticket.transfer_count >= v_ticket.max_transfers_allowed then
    raise exception 'TRANSFER_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.ticket_transfers as tr
    where tr.original_ticket_id = v_ticket.id
      and tr.status = 'pending'::public.ticket_transfer_status
  ) then
    raise exception 'TICKET_TRANSFER_PENDING' using errcode = 'P0001';
  end if;

  if public.ticket_has_active_resale_listing(v_ticket.id) then
    raise exception 'TICKET_ALREADY_LISTED' using errcode = 'P0001';
  end if;

  select tt.price
    into v_tier_price
  from public.ticket_tiers as tt
  where tt.id = v_ticket.tier_id;

  v_price := round(coalesce(v_tier_price, 0)::numeric, 2);
  if v_price <= 0 then
    raise exception 'TICKET_NOT_RESALABLE' using errcode = '23514';
  end if;

  v_fee_pct := public.get_resale_fee_percentage();
  v_fee := round(v_price * (v_fee_pct / 100.0), 2);
  v_net := round(v_price - v_fee, 2);
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');

  update public.tickets
  set
    totp_secret = v_secret,
    updated_at = now()
  where id = v_ticket.id;

  begin
    insert into public.ticket_resale_listings (
      ticket_id,
      seller_id,
      event_id,
      price,
      platform_fee_amount,
      seller_net_amount,
      status
    )
    values (
      v_ticket.id,
      v_seller,
      v_ticket.event_id,
      v_price,
      v_fee,
      v_net,
      'active'::public.ticket_resale_listing_status
    )
    returning * into v_listing;
  exception
    when unique_violation then
      raise exception 'TICKET_ALREADY_LISTED' using errcode = 'P0001';
  end;

  perform public.record_ticket_action_consent(
    v_seller,
    v_ticket.id,
    'resale',
    p_terms_version,
    null,
    v_listing.id
  );

  return query select
    v_listing.id,
    v_listing.ticket_id,
    v_listing.event_id,
    v_listing.price,
    v_listing.status,
    v_listing.created_at;
end;
$$;

revoke all on function public.create_resale_listing(uuid, text) from public;
grant execute on function public.create_resale_listing(uuid, text)
  to authenticated;
