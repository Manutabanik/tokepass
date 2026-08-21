import { pointInPolygon } from "@/lib/seating/venue-map-lod"
import { resolveSeatingType } from "@/lib/seating/seating-type"
import type { MapClickTarget, MapElementType } from "@/types/event-map"
import {
  isSellableElement,
  type InteractiveVenueMap,
  type VenueMapElement,
  type VenueMapZone,
} from "@/types/venue-map"

export type { MapClickTarget, MapElementType }

const CHAIR_TYPES = new Set(["vip_chair"])
const TABLE_TYPES = new Set(["round_table", "long_table", "vip_box"])

export function reservedZoneContainsElement(
  zone: VenueMapZone,
  element: VenueMapElement,
): boolean {
  if (resolveSeatingType(zone) !== "RESERVED") return false
  if (!isSellableElement(element) || element.type === "standing_zone") {
    return false
  }
  const explicitZoneId = element.zoneId?.trim()
  if (explicitZoneId) return explicitZoneId === zone.id
  if (element.groupId?.trim() === zone.id || element.id === zone.id) return true
  return pointInPolygon({ x: element.x, y: element.y }, zone.polygon)
}

export function isUncontainedSellableElement(
  element: VenueMapElement,
  map: InteractiveVenueMap | null | undefined,
): boolean {
  if (!isSellableElement(element)) return false
  for (const zone of map?.zones ?? []) {
    if (reservedZoneContainsElement(zone, element)) return false
  }
  return true
}

export function listUncontainedSellableElements(
  map: InteractiveVenueMap | null | undefined,
): VenueMapElement[] {
  if (!map) return []
  return (map.elements ?? []).filter((element) =>
    isUncontainedSellableElement(element, map),
  )
}

export function classifyZoneClick(
  zone: VenueMapZone,
  map?: InteractiveVenueMap | null,
): Extract<MapElementType, "SECTOR_GENERAL" | "SECTOR_NUMERADO"> {
  return resolveSeatingType(zone) === "RESERVED" &&
    (map
      ? (map.elements ?? []).some((element) =>
          reservedZoneContainsElement(zone, element),
        ) ||
        (map.sectors ?? []).some(
          (sector) =>
            sector.id === zone.id &&
            sector.seats.some((seat) => seat.status !== "blocked"),
        )
      : true)
    ? "SECTOR_NUMERADO"
    : "SECTOR_GENERAL"
}

export function classifyElementClick(
  element: VenueMapElement,
  map?: InteractiveVenueMap | null,
): Extract<MapElementType, "ASIENTO_LIBRE" | "MESA_LIBRE"> | null {
  if (!isSellableElement(element) || element.type === "standing_zone") {
    return null
  }
  if (map && !isUncontainedSellableElement(element, map)) return null
  if (CHAIR_TYPES.has(element.type)) return "ASIENTO_LIBRE"
  if (TABLE_TYPES.has(element.type)) return "MESA_LIBRE"
  return "ASIENTO_LIBRE"
}

export function mapClickTargetFromZone(
  zone: VenueMapZone,
  map?: InteractiveVenueMap | null,
): MapClickTarget {
  const type = classifyZoneClick(zone, map)
  return type === "SECTOR_NUMERADO"
    ? { type, zone }
    : { type: "SECTOR_GENERAL", zone }
}

export function mapClickTargetFromElement(
  element: VenueMapElement,
  map?: InteractiveVenueMap | null,
  seatId?: string,
): MapClickTarget | null {
  const type = classifyElementClick(element, map)
  if (!type) return null
  if (type === "MESA_LIBRE") return { type, element }
  return { type: "ASIENTO_LIBRE", element, seatId }
}

export function mapClickOpensSeatModal(target: MapClickTarget): boolean {
  return target.type === "SECTOR_NUMERADO"
}
