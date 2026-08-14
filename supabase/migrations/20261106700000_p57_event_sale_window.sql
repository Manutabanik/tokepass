-- P57: no vender eventos finalizados o agotados (sin cambiar tablas).
-- event_is_buyable sigue filtrando estado; assert_event_open_for_sale
-- lanza mensajes específicos usados por reserve_tickets_tx / reserve_seating_unit_tx.

create or replace function public.event_sale_ends_at(p_event_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_end timestamptz;
  v_ends_at timestamptz;
  v_date timestamptz;
  v_schedule jsonb;
begin
  select e.date, e.ends_at, coalesce(e.schedule_days::jsonb, '[]'::jsonb)
    into v_date, v_ends_at, v_schedule
  from public.events as e
  where e.id = p_event_id;

  if not found then
    return null;
  end if;

  select max((elem ->> 'end_time')::timestamptz)
    into v_end
  from jsonb_array_elements(v_schedule) as elem
  where nullif(btrim(elem ->> 'end_time'), '') is not null;

  return coalesce(v_end, v_ends_at, v_date);
end;
$$;

revoke all on function public.event_sale_ends_at(uuid) from public;
grant execute on function public.event_sale_ends_at(uuid)
  to authenticated, service_role;

create or replace function public.assert_event_open_for_sale(p_event_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_end timestamptz;
  v_available numeric;
  v_tier_count integer;
begin
  v_end := public.event_sale_ends_at(p_event_id);

  if v_end is not null and v_end < now() then
    raise exception 'El evento ya ha finalizado'
      using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    coalesce(sum(greatest(tt.capacity - tt.sold, 0)), 0)
    into v_tier_count, v_available
  from public.ticket_tiers as tt
  where tt.event_id = p_event_id
    and coalesce(tt.visibility, 'public') is distinct from 'private';

  if v_tier_count > 0 and v_available <= 0 then
    raise exception 'El evento o sector se encuentra agotado'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_event_open_for_sale(uuid) from public;
grant execute on function public.assert_event_open_for_sale(uuid)
  to authenticated, service_role;

-- Las RPC reserve_tickets_tx / reserve_seating_unit_tx invocan
-- event_is_buyable; el assert corre al inicio de esas transacciones.
create or replace function public.event_is_buyable(p_event_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_status public.event_status;
  v_organizer_id uuid;
  v_staff boolean;
begin
  select e.status, e.organizer_id
    into v_status, v_organizer_id
  from public.events as e
  where e.id = p_event_id;

  if not found then
    return false;
  end if;

  v_staff := (
    coalesce(auth.role(), '') = 'service_role'
    or auth.uid() = v_organizer_id
    or public.is_super_admin()
  );

  if v_status = 'published'::public.event_status then
    perform public.assert_event_open_for_sale(p_event_id);
    return true;
  end if;

  if v_status in (
    'draft'::public.event_status,
    'paused'::public.event_status
  ) then
    if not v_staff then
      return false;
    end if;
    perform public.assert_event_open_for_sale(p_event_id);
    return true;
  end if;

  return false;
end;
$$;
