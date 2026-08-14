-- P56: combos parking/access_pass emiten tickets con QR propio + gatera de barrera.

create or replace function public.fulfill_tier_combo_items(
  p_order_id uuid,
  p_tier_id uuid,
  p_owner_id uuid,
  p_status text default 'pending'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_comp record;
  v_item public.event_items%rowtype;
  v_q integer;
  v_i integer;
  v_created integer := 0;
  v_status text := lower(coalesce(p_status, 'pending'));
  v_event_id uuid;
  v_ticket_status public.ticket_status;
  v_secret text;
  v_access_kind text;
begin
  if v_status not in ('pending', 'valid') then
    v_status := 'pending';
  end if;

  v_ticket_status := case
    when v_status = 'valid' then 'valid'::public.ticket_status
    else 'pending_payment'::public.ticket_status
  end;

  select tt.event_id into v_event_id
  from public.ticket_tiers as tt
  where tt.id = p_tier_id;

  if v_event_id is null then
    raise exception 'Ticket tier not found' using errcode = 'P0002';
  end if;

  for v_comp in
    select c.event_item_id, c.quantity
    from public.ticket_tier_combo_items c
    where c.tier_id = p_tier_id
  loop
    select * into v_item
    from public.event_items ei
    where ei.id = v_comp.event_item_id
    for update of ei;

    if not found or not v_item.is_active then
      raise exception 'COMBO_ITEM_UNAVAILABLE' using errcode = 'P0001';
    end if;

    v_q := greatest(1, v_comp.quantity);
    if v_item.stock < v_q then
      raise exception 'COMBO_ITEM_OUT_OF_STOCK' using errcode = 'P0001';
    end if;

    update public.event_items
    set stock = stock - v_q, updated_at = now()
    where id = v_item.id;

    v_access_kind := v_item.category::text;

    for v_i in 1..v_q loop
      if v_access_kind in ('parking', 'access_pass') then
        v_secret := encode(extensions.gen_random_bytes(24), 'hex');
        insert into public.tickets (
          event_id,
          tier_id,
          owner_id,
          qr_code,
          totp_secret,
          status,
          order_id,
          max_admissions,
          admissions_used,
          ticket_type
        )
        values (
          v_event_id,
          p_tier_id,
          p_owner_id,
          gen_random_uuid()::text,
          v_secret,
          v_ticket_status,
          p_order_id,
          1,
          0,
          v_access_kind
        );
      else
        insert into public.item_redemptions (
          order_id,
          item_id,
          user_id,
          qr_code_token,
          status
        )
        values (
          p_order_id,
          v_item.id,
          p_owner_id,
          'cmb_' || replace(gen_random_uuid()::text, '-', ''),
          v_status
        );
      end if;
      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.fulfill_tier_combo_items(uuid, uuid, uuid, text) from public;
grant execute on function public.fulfill_tier_combo_items(uuid, uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.get_event_scanner_gates(p_event_id uuid)
returns table (
  gate_id text,
  label text,
  color text,
  kind text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not public.user_is_event_organizer_or_staff(
    p_event_id,
    auth.uid(),
    array['door_staff'::public.event_staff_role]
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  select
    'general'::text,
    'Acceso General'::text,
    '#10b981'::text,
    'general'::text
  union all
  select
    'parking'::text,
    'Barrera de Estacionamiento'::text,
    '#f59e0b'::text,
    'parking'::text
  union all
  select
    s.sector_id,
    coalesce(nullif(s.sector_name, ''), s.sector_id),
    coalesce(nullif(s.color, ''), '#6366f1'),
    'sector'::text
  from (
    select
      u.sector_id,
      min(u.sector_name) as sector_name,
      min(u.color) as color
    from public.event_seating_units as u
    where u.event_id = p_event_id
    group by u.sector_id
  ) as s
  order by kind asc, label;
end;
$$;

revoke all on function public.get_event_scanner_gates(uuid) from public;
grant execute on function public.get_event_scanner_gates(uuid)
  to authenticated, service_role;
