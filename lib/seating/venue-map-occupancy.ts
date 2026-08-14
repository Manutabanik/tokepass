import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type { VenueMapSeatStatus } from "@/types/venue-map"

export type LiveVenueSeatStatus = "available" | "selected" | "occupied" | "blocked"

export function resolveLiveVenueSeatStatus(input: {
  mapStatus: VenueMapSeatStatus
  occupancy?: SeatStatus
  selected: boolean
}): LiveVenueSeatStatus {
  if (input.mapStatus === "blocked" || input.occupancy === "blocked") {
    return "blocked"
  }
  if (input.occupancy === "occupied") return "occupied"
  if (input.selected) return "selected"
  return "available"
}

/** After a live occupancy fetch, unknown ids are occupied — never optimistic-available. */
export function occupancyFromSeatingUnits(
  units: Array<{ layoutItemId: string; status: string }>,
  knownLayoutItemIds: Iterable<string> = [],
): Record<string, SeatStatus> {
  const occupancy: Record<string, SeatStatus> = {}
  for (const id of knownLayoutItemIds) {
    occupancy[id] = "occupied"
  }
  for (const unit of units) {
    occupancy[unit.layoutItemId] =
      unit.status === "available"
        ? "available"
        : unit.status === "blocked"
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
