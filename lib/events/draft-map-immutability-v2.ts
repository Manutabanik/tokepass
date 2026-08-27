import { createDraftScheduleDay } from "@/lib/events/draft-schedule-slots-v2"
import {
  parseDraftSeatingMaps,
  seatingInstanceToVenueMap,
  toDraftSeatingMap,
} from "@/lib/events/draft-seating-map-v2"
import {
  flattenSeatsForAvailability,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"
import {
  isSellableElement,
  type InteractiveVenueMap,
} from "@/types/venue-map"

export const ACTIVE_SALE_LAYOUT_DELETE_ERROR =
  "No puedes eliminar asientos con ventas activas. Mantenlo en el mapa y márcalo como 'bloqueado'."

export type ProtectedLayoutItem = {
  itemId: string
  dateId: string | null
}

export function layoutItemKey(dateId: string | null | undefined, itemId: string): string {
  return `${(dateId ?? "").trim()}::${itemId.trim()}`
}

export function collectVenueMapLayoutItemIds(
  map: InteractiveVenueMap | null | undefined,
): string[] {
  if (!map) return []
  const ids = new Set<string>()
  const add = (value?: string | null) => {
    const id = value?.trim() ?? ""
    if (id) ids.add(id)
  }

  for (const sector of map.sectors ?? []) {
    add(sector.id)
    for (const seat of sector.seats ?? []) add(seat.id)
  }
  for (const element of map.elements ?? []) {
    add(element.id)
    if (!isSellableElement(element)) continue
    for (const seat of element.seats ?? []) add(seat.id)
  }
  for (const zone of map.zones ?? []) add(zone.id)

  for (const sector of venueMapToSeatingLayout(map)) {
    add(sector.id)
    for (const row of sector.rows ?? []) {
      for (const item of row.items ?? []) add(item.id)
    }
  }
  for (const seat of flattenSeatsForAvailability(map)) {
    add(seat.id)
    add(seat.sectorId)
  }

  return [...ids]
}

/**
 * Single-day v1 map save uses the same immutability keys as editor drafts.
 * Multi-day saves must not call this: one global map is not a per-day source.
 */
export function draftLayoutSourceFromSavedVenueMap(input: {
  map: InteractiveVenueMap
  scheduleDayIds: readonly string[]
}): Pick<EventDraftV2, "seatingMaps" | "seatingMap" | "schedule"> {
  const dateId = input.scheduleDayIds[0] ?? ""
  return {
    seatingMap: toDraftSeatingMap(input.map),
    seatingMaps: [
      {
        dateId,
        mapConfig: input.map,
        pricing: { sectorPrices: {}, blockedSeatIds: [] },
      },
    ],
    schedule: dateId ? [createDraftScheduleDay({ id: dateId })] : [],
  }
}

export function collectDraftLayoutItemKeys(
  draft: Pick<EventDraftV2, "seatingMaps" | "seatingMap" | "schedule">,
): Set<string> {
  const maps = parseDraftSeatingMaps(
    draft.seatingMaps,
    draft.seatingMap,
    draft.schedule?.[0]?.id ?? "",
  )
  const keys = new Set<string>()
  for (const instance of maps) {
    const dateId = instance.dateId.trim()
    const map = seatingInstanceToVenueMap(instance)
    for (const itemId of collectVenueMapLayoutItemIds(map)) {
      keys.add(layoutItemKey(dateId, itemId))
    }
  }
  return keys
}

export function incomingKeepsLayoutItem(
  incomingKeys: ReadonlySet<string>,
  itemId: string,
  dateId?: string | null,
): boolean {
  const id = itemId.trim()
  if (!id) return true
  const day = (dateId ?? "").trim()
  if (day && incomingKeys.has(layoutItemKey(day, id))) return true
  if (incomingKeys.has(layoutItemKey("", id))) return true
  if (!day) {
    for (const key of incomingKeys) {
      if (key.endsWith(`::${id}`)) return true
    }
  }
  return false
}

export function missingProtectedLayoutItems(
  incomingKeys: ReadonlySet<string>,
  protectedItems: readonly ProtectedLayoutItem[],
): ProtectedLayoutItem[] {
  const seen = new Set<string>()
  const missing: ProtectedLayoutItem[] = []
  for (const item of protectedItems) {
    const id = item.itemId.trim()
    if (!id) continue
    const key = layoutItemKey(item.dateId, id)
    if (seen.has(key)) continue
    if (incomingKeepsLayoutItem(incomingKeys, id, item.dateId)) continue
    seen.add(key)
    missing.push({ itemId: id, dateId: item.dateId })
  }
  return missing
}

export function isActiveSeatingHold(input: {
  status?: string | null
  soldOrderId?: string | null
  reservedUntil?: string | null
  nowMs?: number
}): boolean {
  const status = (input.status ?? "").trim()
  if (status === "sold" || status === "reserved") return true
  if (input.soldOrderId?.trim()) return true
  const until = input.reservedUntil?.trim()
  if (!until) return false
  const ms = new Date(until).getTime()
  if (!Number.isFinite(ms)) return false
  return ms > (input.nowMs ?? Date.now())
}
