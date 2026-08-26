import type { SeatStatus } from "@/lib/seating/universal-seat-types"

export type OccupancyRealtimeRow = {
  event_id?: string
  layout_item_id?: string
  status?: string
}

function statusToOccupancy(status: string | undefined): SeatStatus {
  if (status === "available") return "available"
  if (status === "blocked") return "blocked"
  if (status === "reserved" || status === "held") return "held"
  return "occupied"
}

export function occupancyPatchFromSeatingRow(
  row: OccupancyRealtimeRow | null,
): Record<string, SeatStatus> | null {
  if (!row) return null
  const layoutItemId = row.layout_item_id?.trim()
  if (!layoutItemId) return null
  return { [layoutItemId]: statusToOccupancy(row.status) }
}

export function occupancyPatchFromRealtimePayload(payload: {
  eventType?: string
  new?: OccupancyRealtimeRow | null
  old?: OccupancyRealtimeRow | null
}): Record<string, SeatStatus> | null {
  if (payload.eventType === "DELETE") {
    const layoutItemId = payload.old?.layout_item_id?.trim()
    if (!layoutItemId) return null
    return { [layoutItemId]: "available" }
  }
  return occupancyPatchFromSeatingRow(payload.new ?? null)
}
