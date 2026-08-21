import { flattenVenueMapSeats } from "@/lib/seating/venue-map-geometry"
import {
  isSellableElement,
  parseVenueMap,
  type InteractiveVenueMap,
} from "@/types/venue-map"

/** POS: solo hay plano interactivo si hay butacas o mesas vendibles. */
export function posEventHasInteractiveMap(
  ...sources: unknown[]
): boolean {
  for (const source of sources) {
    if (source == null) continue
    const map = parseVenueMap(source)
    if (posMapHasNumberedInventory(map)) return true
  }
  return false
}

export function posMapHasNumberedInventory(
  map: InteractiveVenueMap | null | undefined,
): boolean {
  if (!map) return false
  if (flattenVenueMapSeats(map).length > 0) return true
  return (map.elements ?? []).some(
    (element) =>
      isSellableElement(element) && element.type !== "standing_zone",
  )
}
