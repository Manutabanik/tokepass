import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type { VenueMapSeatStatus } from "@/types/venue-map"

export type LiveVenueSeatStatus = "available" | "selected" | "occupied" | "blocked"

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

/** After a live occupancy fetch, unknown ids are occupied — never optimistic-available. */
export function occupancyFromSeatingUnits(
  units: Array<{
    layoutItemId: string
    status: string
    reservedUntil?: string | null
  }>,
  knownLayoutItemIds: Iterable<string> = [],
): Record<string, SeatStatus> {
  const occupancy: Record<string, SeatStatus> = {}
  for (const id of knownLayoutItemIds) {
    occupancy[id] = "occupied"
  }
  for (const unit of units) {
    const status = effectiveSeatingUnitStatus(unit.status, unit.reservedUntil)
    occupancy[unit.layoutItemId] =
      status === "available"
        ? "available"
        : status === "blocked"
          ? "blocked"
          : "occupied"
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
