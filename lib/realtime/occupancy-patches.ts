import { inventoryRowMatchesActiveDay } from "@/lib/checkout/seat-hold-day"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"

export type OccupancyRealtimeRow = {
  id?: string
  event_id?: string
  layout_item_id?: string
  status?: string
  event_date_id?: string | null
}

function occupancyAliasPatch(
  layoutItemId: string,
  status: SeatStatus,
  unitId?: string | null,
): Record<string, SeatStatus> {
  const patch: Record<string, SeatStatus> = { [layoutItemId]: status }
  const id = unitId?.trim()
  if (id && id !== layoutItemId) patch[id] = status
  return patch
}

export type OccupancyDayScope = {
  eventDateId?: string | null
  scheduleDayCount?: number
}

function statusToOccupancy(status: string | undefined): SeatStatus {
  if (status === "available") return "available"
  if (status === "blocked") return "blocked"
  if (status === "reserved" || status === "held") return "held"
  return "occupied"
}

export function occupancyRowMatchesDay(
  row: OccupancyRealtimeRow | null | undefined,
  scope?: OccupancyDayScope,
): boolean {
  return inventoryRowMatchesActiveDay(
    row?.event_date_id,
    scope?.eventDateId,
    scope?.scheduleDayCount ?? 0,
  )
}

export function occupancyPatchFromSeatingRow(
  row: OccupancyRealtimeRow | null,
  scope?: OccupancyDayScope,
): Record<string, SeatStatus> | null {
  if (!row || !occupancyRowMatchesDay(row, scope)) return null
  const layoutItemId = row.layout_item_id?.trim()
  if (!layoutItemId) return null
  return occupancyAliasPatch(
    layoutItemId,
    statusToOccupancy(row.status),
    row.id,
  )
}

export function occupancyPatchFromRealtimePayload(
  payload: {
    eventType?: string
    new?: OccupancyRealtimeRow | null
    old?: OccupancyRealtimeRow | null
  },
  scope?: OccupancyDayScope,
): Record<string, SeatStatus> | null {
  if (payload.eventType === "DELETE") {
    const old = payload.old
    if (!old || !occupancyRowMatchesDay(old, scope)) return null
    const layoutItemId = old.layout_item_id?.trim()
    if (!layoutItemId) return null
    return occupancyAliasPatch(layoutItemId, "available", old.id)
  }
  return occupancyPatchFromSeatingRow(payload.new ?? null, scope)
}
