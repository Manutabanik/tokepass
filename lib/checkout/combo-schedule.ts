import { resolveTicketCommerceType } from "@/lib/events/ticket-commerce-type"
import { isFullPassDayId, normalizeDayId } from "@/lib/event-schedule"
import type { ScheduleDay } from "@/types/events"

/** Virtual tab in the date-card row. Not an event_schedules.id. */
export const COMBO_PACKS_TAB_ID = "combo_packs"

export const COMBO_PACKS_SUBTITLE =
  "Asegurá tu lugar para todo el evento con un solo clic"

export type ComboScheduleTier = {
  ticketType?: string | null
  ticket_type?: string | null
  dayId?: string | null
  dateId?: string | null
  validDayIds?: string[] | null
  comboScheduleIds?: string[] | null
  combo_schedule_ids?: string[] | null
  name?: string | null
  isFullPass?: boolean
  tierType?: string | null
  tier_type?: string | null
  layoutType?: string | null
  layout_type?: string | null
  category?: string | null
  bundleType?: string | null
  bundle_type?: string | null
  comboItems?: Array<unknown> | null
}

function uniqueDayIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of ids) {
    const id = normalizeDayId(raw) ?? raw.trim()
    if (!id || isFullPassDayId(id) || id === COMBO_PACKS_TAB_ID) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function isComboPacksTabId(value: unknown): boolean {
  return value === COMBO_PACKS_TAB_ID
}

/** Combo / pack SKU: explicit commerce type or 2+ jornadas. */
export function isComboPackOffer(tier: ComboScheduleTier): boolean {
  if (resolveTicketCommerceType(tier) === "combo") return true
  return comboScheduleIdsFromTier(tier).length > 1
}

export function comboScheduleIdsFromTier(
  tier: ComboScheduleTier,
  scheduleDays: ScheduleDay[] = [],
): string[] {
  const explicit = uniqueDayIds([
    ...(tier.comboScheduleIds ?? []),
    ...(tier.combo_schedule_ids ?? []),
  ])
  if (explicit.length > 0) return explicit

  const valid = uniqueDayIds(tier.validDayIds ?? [])
  if (valid.length > 1) return valid

  if (resolveTicketCommerceType(tier) !== "combo") return []
  if (scheduleDays.length > 1) {
    return uniqueDayIds(scheduleDays.map((day) => day.id))
  }
  return []
}

export function comboHoldScheduleIds(
  tier: ComboScheduleTier | null | undefined,
  scheduleDays: ScheduleDay[] = [],
  fallbackDateId?: string | null,
): string[] {
  if (!tier) {
    const fallback = normalizeDayId(fallbackDateId)
    return fallback ? [fallback] : []
  }
  const fromCombo = comboScheduleIdsFromTier(tier, scheduleDays)
  if (fromCombo.length > 0) return fromCombo
  const fallback = normalizeDayId(fallbackDateId)
  return fallback ? [fallback] : []
}
