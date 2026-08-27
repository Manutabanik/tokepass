import { seatingUnitMatchesEventDate } from "@/lib/checkout/seat-hold-day"
import {
  inventoryStateToSeatStatus,
  resolveInventorySeatState,
} from "@/lib/seating/inventory-seat-state"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type { VenueMapSeatStatus } from "@/types/venue-map"

export type LiveVenueSeatStatus =
  | "available"
  | "selected"
  | "occupied"
  | "blocked"
  | "held"

export function resolveLiveVenueSeatStatus(input: {
  mapStatus: VenueMapSeatStatus
  occupancy?: SeatStatus
  selected: boolean
  held?: boolean
}): LiveVenueSeatStatus {
  if (input.mapStatus === "blocked" || input.occupancy === "blocked") {
    return "blocked"
  }
  if (input.selected || input.held) return "selected"
  if (input.occupancy === "occupied") return "occupied"
  if (input.occupancy === "held") return "held"
  return "available"
}

export function isCheckoutHoldExpired(
  reservedUntil: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!reservedUntil) return false
  const ts = new Date(reservedUntil).getTime()
  return Number.isFinite(ts) && ts <= nowMs
}

export function effectiveSeatingUnitStatus(
  status: string,
  reservedUntil?: string | null,
  nowMs: number = Date.now(),
): string {
  if (status === "reserved" && isCheckoutHoldExpired(reservedUntil, nowMs)) {
    return "available"
  }
  return status
}

/** Drop units that belong to another jornada before collapsing by layout_item_id. */
export function seatingUnitsForOccupancyDay<
  T extends { tierId?: string | null; eventDateId?: string | null },
>(
  units: readonly T[],
  input: {
    eventDateId?: string | null
    dayTierIds?: ReadonlySet<string>
    scheduleDayCount?: number
  },
): T[] {
  const dateId = input.eventDateId?.trim() || ""
  const dayTierIds = input.dayTierIds
  const scheduleDayCount = input.scheduleDayCount ?? 0
  const multi = scheduleDayCount >= 2
  if (multi && !dateId) return []
  const hasDatedUnits = units.some((unit) => Boolean(unit.eventDateId?.trim()))
  return units.filter((unit) => {
    if (
      !seatingUnitMatchesEventDate(
        { event_date_id: unit.eventDateId },
        dateId || null,
        { scheduleDayCount },
      )
    ) {
      return false
    }
    if (!multi && dateId && hasDatedUnits && !unit.eventDateId?.trim()) {
      return false
    }
    if (
      dayTierIds &&
      dayTierIds.size > 0 &&
      unit.tierId &&
      !dayTierIds.has(unit.tierId)
    ) {
      return false
    }
    return true
  })
}

/** After a live occupancy fetch, unknown ids are occupied — never optimistic-available. */
export function occupancyFromSeatingUnits(
  units: Array<{
    layoutItemId: string
    status: string
    reservedUntil?: string | null
    holdExpiresAt?: string | null
    sold?: boolean
    soldOrderId?: string | null
  }>,
  knownLayoutItemIds: Iterable<string> = [],
): Record<string, SeatStatus> {
  const occupancy: Record<string, SeatStatus> = {}
  for (const id of knownLayoutItemIds) {
    occupancy[id] = "occupied"
  }
  for (const unit of units) {
    occupancy[unit.layoutItemId] = inventoryStateToSeatStatus(
      resolveInventorySeatState({
        unitStatus: unit.status,
        reservedUntil: unit.reservedUntil,
        holdExpiresAt: unit.holdExpiresAt,
        sold: unit.sold || Boolean(unit.soldOrderId),
      }),
    )
  }
  return occupancy
}

export function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.trim().replace("#", "")
  const normalized =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : raw
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(16, 185, 129, ${alpha})`
  }
  const value = Number.parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
