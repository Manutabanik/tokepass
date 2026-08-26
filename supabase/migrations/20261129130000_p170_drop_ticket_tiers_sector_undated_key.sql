-- =============================================================================
-- P170 · Allow multiple seated tickets on the same sector while day_id is null
--
-- Publish unlinks ticket_tiers.day_id before rewriting event_schedules, then
-- rebinds days. A unique (event_id, seating_sector_id) WHERE day_id IS NULL
-- breaks that two-phase write for multi-day map tickets (23505).
-- Keep only the per-day unique key from P169.
-- =============================================================================

drop index if exists public.ticket_tiers_event_sector_undated_key;
