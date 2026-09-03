import {
  isCheckoutHoldExpired,
  type LiveVenueSeatStatus,
} from "@/lib/seating/venue-map-occupancy"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"

export type InventorySeatState = "AVAILABLE" | "HELD" | "SOLD"

export const SEAT_HELD_BY_OTHER_MESSAGE =
  "Asiento en proceso de compra. Alguien lo tiene en su carrito y podría liberarse en unos minutos. ¡Mantené la vista aquí!"

export const SEAT_OCCUPIED_MESSAGE = "Lugar ocupado"

/** Un sector entero sin lugares no es "un lugar ocupado". */
export const SECTOR_SOLD_OUT_MESSAGE = "Sector agotado"
export const SECTOR_SOLD_OUT_HINT =
  "No quedan lugares disponibles en este sector."

export function resolveInventorySeatState(input: {
  unitStatus?: string | null
  reservedUntil?: string | null
  holdExpiresAt?: string | null
  sold?: boolean
  nowMs?: number
}): InventorySeatState {
  const nowMs = input.nowMs ?? Date.now()
  const status = (input.unitStatus ?? "").trim()
  if (input.sold || status === "sold") return "SOLD"
  if (status === "blocked") return "SOLD"
  const holdActive =
    Boolean(input.holdExpiresAt) &&
    !isCheckoutHoldExpired(input.holdExpiresAt, nowMs)
  const reservedActive =
    status === "reserved" && !isCheckoutHoldExpired(input.reservedUntil, nowMs)
  if (holdActive || reservedActive) return "HELD"
  return "AVAILABLE"
}

export function inventoryStateToSeatStatus(
  state: InventorySeatState,
): SeatStatus {
  if (state === "SOLD") return "occupied"
  if (state === "HELD") return "held"
  return "available"
}

export function seatStatusToInventoryState(
  status: SeatStatus | LiveVenueSeatStatus | null | undefined,
): InventorySeatState {
  if (status === "occupied" || status === "blocked") return "SOLD"
  if (status === "held") return "HELD"
  return "AVAILABLE"
}

export function isSoldInventoryStatus(
  status: SeatStatus | LiveVenueSeatStatus | null | undefined,
): boolean {
  return status === "occupied" || status === "blocked"
}

export function mergeInventoryOccupancy(
  ...layers: Array<Record<string, SeatStatus> | null | undefined>
): Record<string, SeatStatus> {
  const next: Record<string, SeatStatus> = {}
  for (const layer of layers) {
    if (!layer) continue
    for (const [id, status] of Object.entries(layer)) {
      const current = next[id]
      if (isSoldInventoryStatus(current) && !isSoldInventoryStatus(status)) {
        continue
      }
      next[id] = status
    }
  }
  return next
}

export function occupancyFromSeatHolds(
  holds: Array<{
    layoutItemId?: string | null
    expiresAt?: string | null
    eventDateId?: string | null
    status?: string | null
  }>,
  options?: {
    eventDateId?: string | null
    nowMs?: number
    scheduleDayCount?: number
  },
): Record<string, SeatStatus> {
  const occupancy: Record<string, SeatStatus> = {}
  const dateId = options?.eventDateId?.trim() || null
  const multi = (options?.scheduleDayCount ?? 0) >= 2
  const nowMs = options?.nowMs ?? Date.now()
  for (const hold of holds) {
    const id = hold.layoutItemId?.trim()
    if (!id) continue
    const holdDate = hold.eventDateId?.trim() || null
    if (multi) {
      if (!dateId || holdDate !== dateId) continue
    } else if (dateId && holdDate && holdDate !== dateId) {
      continue
    }
    if (isCheckoutHoldExpired(hold.expiresAt, nowMs)) continue
    occupancy[id] = "held"
  }
  return occupancy
}

export function seatHoldRealtimePatch(
  event: "INSERT" | "UPDATE" | "DELETE" | "*",
  row: {
    layout_item_id?: string | null
    expires_at?: string | null
    event_date_id?: string | null
    status?: string | null
  } | null,
  options?: {
    eventDateId?: string | null
    nowMs?: number
    scheduleDayCount?: number
  },
): Record<string, SeatStatus> | null {
  if (!row) return null
  const layoutItemId = row.layout_item_id?.trim()
  if (!layoutItemId) return null
  const dateId = options?.eventDateId?.trim() || null
  const rowDate = row.event_date_id?.trim() || null
  const multi = (options?.scheduleDayCount ?? 0) >= 2
  if (multi) {
    if (!dateId || rowDate !== dateId) return null
  } else if (dateId && rowDate && rowDate !== dateId) {
    return null
  }
  if (
    event === "DELETE" ||
    isCheckoutHoldExpired(row.expires_at, options?.nowMs)
  ) {
    return { [layoutItemId]: "available" }
  }
  return { [layoutItemId]: "held" }
}
