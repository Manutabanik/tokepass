import { isFullPassDayId } from "@/lib/event-schedule"
import type { TicketDayId } from "@/types/tickets"

export type OccupancyTier = {
  dayId?: TicketDayId | null
  sold: number
  tierType?: string | null
}

/** Extra units to add to `sold` after converting a live GA hold. */
export function additionalUnitsAfterHold(
  held: number,
  requested: number,
): number {
  const safeHeld = Math.max(0, Math.floor(Number(held)) || 0)
  const safeRequested = Math.max(0, Math.floor(Number(requested)) || 0)
  return Math.max(0, safeRequested - safeHeld)
}

export function occupiesVenueStock(tierType: string | null | undefined): boolean {
  return tierType !== "addon" && tierType !== "bundle"
}

/**
 * Physical occupancy for one festival day.
 * Full-pass SKUs (day_id null/all) count on every day.
 * Bundle parents are excluded: P63 already increments children.
 */
export function occupiedDayUnits(
  dayId: string,
  tiers: readonly OccupancyTier[],
): number {
  const target = dayId.trim()
  if (!target) return 0
  return tiers.reduce((sum, tier) => {
    if (!occupiesVenueStock(tier.tierType)) return sum
    const sold = Math.max(0, Math.floor(Number(tier.sold)) || 0)
    if (isFullPassDayId(tier.dayId)) return sum + sold
    if (String(tier.dayId ?? "").trim() === target) return sum + sold
    return sum
  }, 0)
}

export function peakOccupiedVenueUnits(
  dayIds: readonly string[],
  tiers: readonly OccupancyTier[],
): number {
  const days = dayIds.map((id) => id.trim()).filter(Boolean)
  if (days.length === 0) {
    return tiers.reduce((sum, tier) => {
      if (!occupiesVenueStock(tier.tierType)) return sum
      return sum + Math.max(0, Math.floor(Number(tier.sold)) || 0)
    }, 0)
  }
  return days.reduce(
    (peak, dayId) => Math.max(peak, occupiedDayUnits(dayId, tiers)),
    0,
  )
}

export function venueRemainingAfterPurchase(input: {
  venueCap: number
  occupied: number
  additional: number
}): number {
  const cap = Math.max(0, Math.floor(Number(input.venueCap)) || 0)
  const occupied = Math.max(0, Math.floor(Number(input.occupied)) || 0)
  const additional = Math.max(0, Math.floor(Number(input.additional)) || 0)
  return cap - occupied - additional
}
