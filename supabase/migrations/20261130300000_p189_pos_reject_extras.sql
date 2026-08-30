-- P189: POS must not sell extras as admission. The editor publishes extras
-- as ticket_tiers (ticket_type=extra / tier_type=addon). Cashiers used to
-- be able to call process_pos_checkout_tx with those ids.

create or replace function public.assert_pos_admission_tier(
  p_event_id uuid,
  p_tier_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_ticket_type text;
  v_tier_type text;
  v_category text;
begin
  if not exists (
    select 1
    from public.ticket_tiers as tt
    where tt.id = p_tier_id
      and tt.event_id = p_event_id
  ) then
    raise exception 'TIER_NOT_FOUND' using errcode = 'P0002';
  end if;

  begin
    select
      tt.ticket_type::text,
      tt.tier_type::text,
      tt.category::text
      into v_ticket_type, v_tier_type, v_category
    from public.ticket_tiers as tt
    where tt.id = p_tier_id
      and tt.event_id = p_event_id;
  exception
    when undefined_column then
      begin
        select
          tt.tier_type::text,
          tt.category::text
          into v_tier_type, v_category
        from public.ticket_tiers as tt
        where tt.id = p_tier_id
          and tt.event_id = p_event_id;
      exception
        when undefined_column then
          select tt.tier_type::text
            into v_tier_type
          from public.ticket_tiers as tt
          where tt.id = p_tier_id
            and tt.event_id = p_event_id;
      end;
  end;

  if lower(coalesce(v_ticket_type, '')) = 'extra'
     or lower(coalesce(v_tier_type, '')) = 'addon'
     or lower(coalesce(v_category, '')) = 'special' then
    raise exception 'POS_EXTRAS_NOT_SOLD' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_pos_admission_tier(uuid, uuid) from public;
grant execute on function public.assert_pos_admission_tier(uuid, uuid) to authenticated;
grant execute on function public.assert_pos_admission_tier(uuid, uuid) to service_role;
