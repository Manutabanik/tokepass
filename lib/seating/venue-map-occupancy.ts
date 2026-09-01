import { asHoldEventDateId, seatingUnitMatchesEventDate } from "@/lib/checkout/seat-hold-day"
import {
  inventoryStateToSeatStatus,
  isSoldInventoryStatus,
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
  if (input.occupancy === "held" || input.mapStatus === "reserved") return "held"
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

function occupancyRank(status: string, reservedUntil?: string | null): number {
  const effective = effectiveSeatingUnitStatus(status, reservedUntil)
  if (effective === "sold") return 3
  if (effective === "reserved") return 2
  return 1
}

/**
 * Combo / pack: a seat is blocked if it is taken on any jornada of the pack.
 * Collapses to the worst unit per layout_item_id.
 */
export function seatingUnitsForComboDays<
  T extends {
    layoutItemId?: string | null
    eventDateId?: string | null
    status: string
    reservedUntil?: string | null
  },
>(units: readonly T[], comboDayIds: readonly string[]): T[] {
  const days = new Set(
    comboDayIds
      .map((id) => asHoldEventDateId(id))
      .filter((id): id is string => Boolean(id)),
  )
  if (days.size === 0) return []
  const byLayout = new Map<string, T>()
  for (const unit of units) {
    const day = asHoldEventDateId(unit.eventDateId)
    if (!day || !days.has(day)) continue
    const key = unit.layoutItemId?.trim() || ""
    if (!key) continue
    const current = byLayout.get(key)
    if (
      !current ||
      occupancyRank(unit.status, unit.reservedUntil) >
        occupancyRank(current.status, current.reservedUntil)
    ) {
      byLayout.set(key, unit)
    }
  }
  return [...byLayout.values()]
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

/** Draft/map JSON statuses the live inventory may not have indexed yet. */
export function occupancyFromMapSeatStatuses(map?: {
  elements?: ReadonlyArray<{
    id?: string | null
    isLocked?: boolean | null
    seats?: ReadonlyArray<{
      id?: string | null
      status?: string | null
    }>
  }> | null
  sectors?: ReadonlyArray<{
    seats?: ReadonlyArray<{
      id?: string | null
      status?: string | null
    }>
  }> | null
} | null): Record<string, SeatStatus> {
  const occupancy: Record<string, SeatStatus> = {}
  function mark(id: string | null | undefined, status: SeatStatus) {
    const key = id?.trim()
    if (key) occupancy[key] = status
  }
  function fromSeatStatus(status: string | null | undefined): SeatStatus | null {
    if (status === "blocked" || status === "sold" || status === "locked") {
      return "occupied"
    }
    if (status === "reserved") return "held"
    return null
  }
  for (const element of map?.elements ?? []) {
    if (element.isLocked) mark(element.id, "occupied")
    for (const seat of element.seats ?? []) {
      const next = fromSeatStatus(seat.status)
      if (next) mark(seat.id, next)
    }
  }
  for (const sector of map?.sectors ?? []) {
    for (const seat of sector.seats ?? []) {
      const next = fromSeatStatus(seat.status)
      if (next) mark(seat.id, next)
    }
  }
  return occupancy
}

export function lookupOccupancyStatus(
  occupancy: Record<string, SeatStatus | string> | null | undefined,
  ...ids: Array<string | null | undefined>
): SeatStatus | undefined {
  if (!occupancy) return undefined
  let found: SeatStatus | undefined
  for (const raw of ids) {
    const id = raw?.trim()
    if (!id) continue
    const status = occupancy[id]
    if (status === "occupied" || status === "blocked") return status
    if (status === "held" && found !== "held") found = "held"
    if (
      (status === "available" || status === "selected") &&
      !found
    ) {
      found = status === "selected" ? "available" : status
    }
  }
  return found
}

/** Copy table/unit occupancy onto generated chair ids (`mesa-09-S1`). */
export function expandOccupancyToVenueMap(
  occupancy: Record<string, SeatStatus>,
  map?: {
    elements?: Array<{
      id?: string | null
      seats?: Array<{ id?: string | null }>
    }>
  } | null,
): Record<string, SeatStatus> {
  const next = { ...occupancy }
  for (const element of map?.elements ?? []) {
    const parentId = element.id?.trim()
    const parent = lookupOccupancyStatus(occupancy, parentId)
    if (!parent || parent === "available") continue
    for (const seat of element.seats ?? []) {
      const seatId = seat.id?.trim()
      if (!seatId) continue
      const current = next[seatId]
      if (isSoldInventoryStatus(current) && !isSoldInventoryStatus(parent)) {
        continue
      }
      next[seatId] = parent
    }
  }
  return next
}

/** Live units paint occupancy. Drawable ids without a reservation stay free. */
export function occupancyFromSeatingUnits(
  units: Array<{
    id?: string | null
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
  void knownLayoutItemIds
  for (const unit of units) {
    const status = inventoryStateToSeatStatus(
      resolveInventorySeatState({
        unitStatus: unit.status,
        reservedUntil: unit.reservedUntil,
        holdExpiresAt: unit.holdExpiresAt,
        sold: unit.sold || Boolean(unit.soldOrderId),
      }),
    )
    occupancy[unit.layoutItemId] = status
    const unitId = unit.id?.trim()
    if (unitId && unitId !== unit.layoutItemId) {
      occupancy[unitId] = status
    }
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
