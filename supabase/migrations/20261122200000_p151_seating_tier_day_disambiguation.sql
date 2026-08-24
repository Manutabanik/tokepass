-- Disambiguate configure_event_seating_tiers when multiple tiers share a name
-- (e.g. multi-day "General" rows per jornada).

create or replace function public.configure_event_seating_tiers(
  p_event_id uuid,
  p_configs jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config jsonb;
  v_tier_id uuid;
  v_updated integer;
  v_sector text;
  v_zone_id uuid;
  v_day_id text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and not exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and (
        e.organizer_id = auth.uid()
        or public.is_super_admin()
      )
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_configs is null or jsonb_typeof(p_configs) <> 'array' then
    raise exception 'p_configs debe ser un array'
      using errcode = '22023';
  end if;

  for v_config in
    select value from jsonb_array_elements(p_configs)
  loop
    v_tier_id := null;
    begin
      v_tier_id := nullif(v_config ->> 'id', '')::uuid;
    exception when others then
      v_tier_id := null;
    end;

    v_sector := public.ticket_tier_payload_sector_id(v_config);
    v_zone_id := public.ticket_tier_resolve_zone_id(p_event_id, v_config);

    v_day_id := coalesce(
      nullif(btrim(v_config ->> 'day_id'), ''),
      nullif(btrim(v_config ->> 'event_day_id'), '')
    );
    if v_day_id is not null and lower(v_day_id) = 'all' then
      v_day_id := null;
    end if;

    if v_tier_id is not null then
      update public.ticket_tiers
      set
        layout_type = case
          when v_config ->> 'layout_type' in (
            'general', 'table_combo', 'numbered_seat'
          ) then v_config ->> 'layout_type'
          else 'general'
        end,
        seating_sector_id = v_sector,
        zone_id = v_zone_id,
        capacity_per_unit = greatest(
          1,
          least(
            100,
            coalesce(
              nullif(v_config ->> 'capacity_per_unit', '')::integer,
              1
            )
          )
        ),
        updated_at = now()
      where id = v_tier_id
        and event_id = p_event_id;
    else
      update public.ticket_tiers
      set
        layout_type = case
          when v_config ->> 'layout_type' in (
            'general', 'table_combo', 'numbered_seat'
          ) then v_config ->> 'layout_type'
          else 'general'
        end,
        seating_sector_id = v_sector,
        zone_id = v_zone_id,
        capacity_per_unit = greatest(
          1,
          least(
            100,
            coalesce(
              nullif(v_config ->> 'capacity_per_unit', '')::integer,
              1
            )
          )
        ),
        updated_at = now()
      where event_id = p_event_id
        and name = v_config ->> 'name'
        and (
          (v_day_id is null and day_id is null)
          or day_id = v_day_id::uuid
        );
    end if;

    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'SEATING_TIER_CONFIG_AMBIGUOUS: %',
        coalesce(v_config ->> 'name', v_config ->> 'id', '?')
        using errcode = '23514';
    end if;
  end loop;

  update public.ticket_tiers as tt
  set zone_id = null
  where tt.event_id = p_event_id
    and tt.layout_type = 'general'
    and nullif(btrim(coalesce(tt.seating_sector_id, '')), '') is null
    and tt.zone_id is not null;
end;
$$;

revoke all on function public.configure_event_seating_tiers(uuid, jsonb)
  from public, anon;
grant execute on function public.configure_event_seating_tiers(uuid, jsonb)
  to authenticated, service_role;

comment on function public.configure_event_seating_tiers(uuid, jsonb) is
  'Persiste layout/sector. Sin id, desambigua por nombre + day_id.';
