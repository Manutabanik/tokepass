import { isVenueMapElementSoldOut } from "@/lib/seating/map-inventory-hydration"
import { lookupOccupancyStatus } from "@/lib/seating/venue-map-occupancy"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import type {
  InteractiveVenueMap,
  VenueMapElement,
} from "@/types/venue-map"

export const EDITOR_STOCK_LOCK_MESSAGE =
  "Este lugar tiene stock vendido, reservado o bloqueado y no se puede editar."

export function isCommittedEditorStock(
  status: SeatStatus | string | null | undefined,
): boolean {
  return status === "occupied" || status === "blocked" || status === "held"
}

export function layoutIdHasCommittedStock(
  occupancy: Record<string, SeatStatus> | null | undefined,
  ...ids: Array<string | null | undefined>
): boolean {
  return isCommittedEditorStock(lookupOccupancyStatus(occupancy, ...ids))
}

export function elementHasCommittedStock(
  element: Pick<VenueMapElement, "id" | "seats" | "sellMode">,
  occupancy: Record<string, SeatStatus> | null | undefined,
): boolean {
  if (!occupancy || Object.keys(occupancy).length === 0) return false
  if (isVenueMapElementSoldOut(element as VenueMapElement, occupancy)) return true
  if (layoutIdHasCommittedStock(occupancy, element.id)) return true
  return (element.seats ?? []).some((seat) =>
    layoutIdHasCommittedStock(occupancy, seat.id, element.id),
  )
}

export function applyLocalStockLocks(
  map: InteractiveVenueMap,
  occupancy: Record<string, SeatStatus> | null | undefined,
): InteractiveVenueMap {
  if (!occupancy || Object.keys(occupancy).length === 0) return map
  return {
    ...map,
    elements: (map.elements ?? []).map((element) =>
      elementHasCommittedStock(element, occupancy)
        ? { ...element, isLocked: true }
        : element,
    ),
  }
}

export function elementIdsHaveCommittedStock(
  map: Pick<InteractiveVenueMap, "elements">,
  ids: readonly string[],
  occupancy: Record<string, SeatStatus> | null | undefined,
): boolean {
  if (ids.length === 0) return false
  const wanted = new Set(ids)
  return (map.elements ?? []).some(
    (item) =>
      wanted.has(item.id) &&
      (item.isLocked === true || elementHasCommittedStock(item, occupancy)),
  )
}

export function seatKeysHaveCommittedStock(
  keys: readonly string[],
  occupancy: Record<string, SeatStatus> | null | undefined,
): boolean {
  return keys.some((key) => {
    const splitAt = key.indexOf("::")
    const ownerId = splitAt < 0 ? "" : key.slice(0, splitAt)
    const seatId = splitAt < 0 ? key : key.slice(splitAt + 2)
    return layoutIdHasCommittedStock(occupancy, seatId, ownerId)
  })
}
