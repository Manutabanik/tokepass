-- =============================================================================
-- P169 · Same seating sector may have one ticket tier per event day
-- =============================================================================

drop index if exists public.ticket_tiers_event_sector_key;

create unique index if not exists ticket_tiers_event_sector_day_key
  on public.ticket_tiers(event_id, seating_sector_id, day_id)
  where layout_type <> 'general'
    and seating_sector_id is not null
    and day_id is not null;

create unique index if not exists ticket_tiers_event_sector_undated_key
  on public.ticket_tiers(event_id, seating_sector_id)
  where layout_type <> 'general'
    and seating_sector_id is not null
    and day_id is null;
