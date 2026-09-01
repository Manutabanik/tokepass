import type { InteractiveVenueMap, VenueMapElement, VenueMapZone } from "@/types/venue-map"
import { isSellableElement } from "@/types/venue-map"

import { zoneIdContainingCanvasPoint } from "./venue-polygon"

export type AdoptableZone = Pick<VenueMapZone, "id" | "name" | "color" | "price">

function elementCanvasCenter(element: VenueMapElement) {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  }
}

/**
 * Prefer the collision hover from the last drag frame; if it was already
 * cleared, fall back to a centroid hit-test of the dropped elements.
 */
export function resolveDropZoneId(
  elements: readonly VenueMapElement[],
  zones: readonly VenueMapZone[] | undefined,
  hoveredZoneId?: string | null,
): string | null {
  const list = zones ?? []
  const hovered = hoveredZoneId?.trim()
  if (hovered && list.some((zone) => zone.id === hovered)) {
    return hovered
  }
  if (elements.length === 0 || list.length === 0) return null
  const cx =
    elements.reduce((sum, item) => sum + elementCanvasCenter(item).x, 0) /
    elements.length
  const cy =
    elements.reduce((sum, item) => sum + elementCanvasCenter(item).y, 0) /
    elements.length
  return zoneIdContainingCanvasPoint({ x: cx, y: cy }, list)
}

/**
 * Parent a sellable element to a zone so it inherits commercial metadata and fill color.
 * Custom furniture groups (`groupId` other than the previous/current zone) stay intact.
 */
export function adoptElementIntoZone(
  element: VenueMapElement,
  zone: AdoptableZone,
): VenueMapElement {
  if (!isSellableElement(element)) return element

  const previousZoneId = element.zoneId?.trim() || ""
  const groupId = element.groupId?.trim() || ""
  const inheritGroup = !groupId || groupId === previousZoneId || groupId === zone.id
  const nextColor = zone.color?.trim() || element.color
  const nextPrice = zone.price > 0 ? zone.price : element.price

  return {
    ...element,
    zoneId: zone.id,
    sectorName: zone.name,
    color: nextColor,
    price: nextPrice,
    ...(inheritGroup ? { groupId: zone.id, groupName: zone.name } : {}),
  }
}

export function adoptElementsIntoZone(
  map: InteractiveVenueMap,
  zoneId: string,
  elementIds: readonly string[],
): InteractiveVenueMap {
  const zone = (map.zones ?? []).find((item) => item.id === zoneId)
  if (!zone || elementIds.length === 0) return map

  const ids = new Set(elementIds)
  let changed = false
  const elements = (map.elements ?? []).map((element) => {
    if (!ids.has(element.id)) return element
    const next = adoptElementIntoZone(element, zone)
    if (
      next.zoneId !== element.zoneId ||
      next.color !== element.color ||
      next.sectorName !== element.sectorName ||
      next.groupId !== element.groupId ||
      next.groupName !== element.groupName ||
      next.price !== element.price
    ) {
      changed = true
      return next
    }
    return element
  })

  return changed ? { ...map, elements } : map
}
