import { elementAabb, unionAabb, type Aabb } from "@/lib/seating/venue-transform"
import {
  canvasPointToPercent,
  polygonToCanvas,
  VENUE_MAP_CANVAS,
} from "@/lib/seating/venue-polygon"
import {
  isSellableElement,
  type InteractiveVenueMap,
  type VenueMapElement,
  type VenueMapPoint,
  type VenueMapZone,
} from "@/types/venue-map"

export type MapLodMode = "macro" | "micro"

export const LOD_CAMERA_PADDING = 0.1
export const LOD_OPACITY_MS = 300
export const CONTEXT_FOCUS_MAX_SCALE = 1.5
export const CONTEXT_FOCUS_MIN_SCALE = 1
export const CONTEXT_FOCUS_PADDING = 0.45
export const CONTEXT_FOCUS_MIN_SPAN = 320
export const CONTEXT_FOCUS_STAGE_TOP = -40
export const CONTEXT_FOCUS_ANIM_MS = 400

const SYNTH_PAD = 18

export function zoneCanvasAabb(zone: Pick<VenueMapZone, "polygon">): Aabb | null {
  const points = polygonToCanvas(zone.polygon)
  if (points.length < 3) return null
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

export function pointInPolygon(
  point: VenueMapPoint,
  polygon: VenueMapPoint[],
): boolean {
  const ring = polygonToCanvas(polygon)
  if (ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]!
    const b = ring[j]!
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

function namesMatch(left: string | undefined, right: string | undefined) {
  const a = left?.trim().toLowerCase()
  const b = right?.trim().toLowerCase()
  return Boolean(a && b && a === b)
}

export function elementBelongsToZone(
  element: VenueMapElement,
  zone: VenueMapZone,
): boolean {
  const explicitZoneId = element.zoneId?.trim()
  if (explicitZoneId) return explicitZoneId === zone.id
  if (element.groupId?.trim() === zone.id) return true
  if (element.id === zone.id) return true
  if (namesMatch(element.sectorName, zone.name)) return true
  if (namesMatch(element.groupName, zone.name)) return true
  return pointInPolygon({ x: element.x, y: element.y }, zone.polygon)
}

export function seatBelongsToZone(
  seat: { x: number; y: number; sectorId: string; sectorName: string },
  zone: VenueMapZone,
): boolean {
  if (seat.sectorId === zone.id) return true
  if (namesMatch(seat.sectorName, zone.name)) return true
  return pointInPolygon({ x: seat.x, y: seat.y }, zone.polygon)
}

function aabbToPercentPolygon(box: Aabb, pad = SYNTH_PAD): VenueMapPoint[] {
  const minX = Math.max(0, box.minX - pad)
  const minY = Math.max(0, box.minY - pad)
  const maxX = Math.min(VENUE_MAP_CANVAS.width, box.maxX + pad)
  const maxY = Math.min(VENUE_MAP_CANVAS.height, box.maxY + pad)
  return [
    canvasPointToPercent({ x: minX, y: minY }),
    canvasPointToPercent({ x: maxX, y: minY }),
    canvasPointToPercent({ x: maxX, y: maxY }),
    canvasPointToPercent({ x: minX, y: maxY }),
  ]
}

/** Helper de AABB. El storefront B2C no lo usa: solo poligonos del Studio. */
export function synthesizeLodZones(map: InteractiveVenueMap): VenueMapZone[] {
  const groups = new Map<string, VenueMapElement[]>()
  for (const element of (map.elements ?? []).filter(isSellableElement)) {
    const key =
      element.groupId?.trim() ||
      element.sectorName?.trim() ||
      element.groupName?.trim() ||
      "general"
    const list = groups.get(key) ?? []
    list.push(element)
    groups.set(key, list)
  }
  if (groups.size < 2) return []
  return [...groups.entries()].flatMap(([key, members], index) => {
    const box = unionAabb(members.map(elementAabb))
    if (!box) return []
    const head = members[0]!
    return [
      {
        id: key,
        name: head.groupName?.trim() || head.sectorName?.trim() || `Sector ${index + 1}`,
        color: head.color || "#22d3ee",
        price: head.price,
        polygon: aabbToPercentPolygon(box),
        layoutType: "table_combo" as const,
        sellMode: "group" as const,
        priceMode: "closed_unit" as const,
        rows: 1,
        itemsPerRow: members.length,
        capacityPerUnit: 1,
        capacity: members.reduce((sum, item) => sum + (item.capacity || 1), 0),
        labelPrefix: "Mesa ",
      },
    ]
  })
}

export function resolveLodZones(map: InteractiveVenueMap): VenueMapZone[] {
  return (map.zones ?? []).filter((zone) => zone.polygon.length >= 3)
}

export function shouldEnableMapLod(map: InteractiveVenueMap): boolean {
  return resolveLodZones(map).length > 0
}

export function expandSelectionForContext(
  box: Aabb,
  canvas = VENUE_MAP_CANVAS,
): Aabb {
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const spanX = Math.max(CONTEXT_FOCUS_MIN_SPAN, box.maxX - box.minX)
  const spanY = Math.max(CONTEXT_FOCUS_MIN_SPAN * 0.7, box.maxY - box.minY)
  return {
    minX: Math.max(0, cx - spanX / 2),
    maxX: Math.min(canvas.width, cx + spanX / 2),
    minY: Math.min(CONTEXT_FOCUS_STAGE_TOP, cy - spanY / 2),
    maxY: Math.min(canvas.height, Math.max(box.maxY, cy + spanY / 2)),
  }
}

export function lodCameraTransform(
  box: Aabb,
  wrapWidth: number,
  wrapHeight: number,
  options?: { padding?: number; minScale?: number; maxScale?: number },
): { scale: number; positionX: number; positionY: number } {
  const padding = options?.padding ?? LOD_CAMERA_PADDING
  const minScale = options?.minScale ?? 0.5
  const maxScale = options?.maxScale ?? 5
  const width = Math.max(8, box.maxX - box.minX)
  const height = Math.max(8, box.maxY - box.minY)
  const paddedW = width * (1 + padding * 2)
  const paddedH = height * (1 + padding * 2)
  const scale = Math.min(
    maxScale,
    Math.max(
      minScale,
      Math.min(VENUE_MAP_CANVAS.width / paddedW, VENUE_MAP_CANVAS.height / paddedH),
    ),
  )
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const viewW = Math.max(1, wrapWidth)
  const viewH = Math.max(1, wrapHeight)
  return {
    scale,
    positionX: viewW / 2 - (cx / VENUE_MAP_CANVAS.width) * viewW * scale,
    positionY: viewH / 2 - (cy / VENUE_MAP_CANVAS.height) * viewH * scale,
  }
}

export function elementsInFocusedZone(
  elements: VenueMapElement[],
  zone: VenueMapZone | null,
): VenueMapElement[] {
  if (!zone) return []
  return elements.filter(
    (element) => isSellableElement(element) && elementBelongsToZone(element, zone),
  )
}

export function publicRevealElements(
  elements: VenueMapElement[] | undefined,
  zone: VenueMapZone | null,
): VenueMapElement[] {
  if (!zone) return []
  return elementsInFocusedZone(elements ?? [], zone)
}

export function publicRevealSeats<
  T extends { x: number; y: number; sectorId: string; sectorName: string },
>(seats: T[], zone: VenueMapZone | null): T[] {
  if (!zone) return []
  return seats.filter((seat) => seatBelongsToZone(seat, zone))
}
