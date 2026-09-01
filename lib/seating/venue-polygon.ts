import { rotatePoint } from "@/lib/seating/venue-element-geometry"
import type { LiveTransform } from "@/lib/seating/venue-transform"
import type { VenueMapPoint, VenueMapZone } from "@/types/venue-map"

export const VENUE_MAP_CANVAS = { width: 800, height: 560 } as const

const CLOSE_SNAP_PX = 14

/**
 * Percent space may overflow 100% (expanded viewBox). This is a documentation
 * bound only — overflowing a vertex past 140 must never trigger pixel reconversion.
 */
export const VENUE_PERCENT_OVERFLOW_MAX = 140

/**
 * Unmarked legacy polygons are canvas pixels only when a vertex cannot be a
 * percent overflow of the 800×560 world.
 */
export const VENUE_PIXEL_SPACE_MIN = 200

export type VenuePolygonSpace = "percent" | "pixels"

export function parsePolygonSpace(value: unknown): VenuePolygonSpace | undefined {
  if (value === "percent" || value === "pixels") return value
  return undefined
}

export function roundMapCoord(value: number, digits = 3): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function polygonLooksLikePixels(
  points: VenueMapPoint[],
  space?: VenuePolygonSpace | null,
): boolean {
  if (space === "percent") return false
  if (space === "pixels") return true
  return points.some(
    (point) =>
      point.x > VENUE_PIXEL_SPACE_MIN || point.y > VENUE_PIXEL_SPACE_MIN,
  )
}

export function canvasPointToPercent(point: VenueMapPoint): VenueMapPoint {
  return {
    x: roundMapCoord((point.x / VENUE_MAP_CANVAS.width) * 100),
    y: roundMapCoord((point.y / VENUE_MAP_CANVAS.height) * 100),
  }
}

export function percentPointToCanvas(point: VenueMapPoint): VenueMapPoint {
  return {
    x: roundMapCoord((point.x / 100) * VENUE_MAP_CANVAS.width, 1),
    y: roundMapCoord((point.y / 100) * VENUE_MAP_CANVAS.height, 1),
  }
}

/** Always canvas → %. Never run the pixel heuristic (draft close path). */
export function polygonFromCanvas(points: VenueMapPoint[]): VenueMapPoint[] {
  return points.map(canvasPointToPercent)
}

function keepPercentPolygon(points: VenueMapPoint[]): VenueMapPoint[] {
  return points.map((point) => ({
    x: roundMapCoord(point.x),
    y: roundMapCoord(point.y),
  }))
}

/**
 * Round percent vertices. Never remultiply/redivide when the polygon is already
 * percent (explicit mark, or unmarked overflow still inside percent space).
 */
export function normalizePolygonToPercent(
  points: VenueMapPoint[],
  space?: VenuePolygonSpace | null,
): VenueMapPoint[] {
  if (points.length === 0) return points
  if (space === "percent" || !polygonLooksLikePixels(points, space)) {
    return keepPercentPolygon(points)
  }
  return polygonFromCanvas(points)
}

export function polygonToCanvas(
  points: VenueMapPoint[],
  space?: VenuePolygonSpace | null,
): VenueMapPoint[] {
  if (points.length === 0) return points
  if (polygonLooksLikePixels(points, space)) return points
  return points.map(percentPointToCanvas)
}

/** Replace one vertex in canvas space; every other vertex stays as stored. */
export function setPolygonVertexAtCanvas(
  polygon: VenueMapPoint[],
  index: number,
  canvasPoint: VenueMapPoint,
): VenueMapPoint[] {
  if (index < 0 || index >= polygon.length) return polygon
  return polygon.map((point, pointIndex) =>
    pointIndex === index ? canvasPointToPercent(canvasPoint) : point,
  )
}

export function popPolygonDraft<T>(points: readonly T[]): T[] {
  return points.slice(0, -1)
}

export function translatePercentPolygon(
  points: VenueMapPoint[],
  dx: number,
  dy: number,
): VenueMapPoint[] {
  return polygonToCanvas(points).map((point) =>
    canvasPointToPercent({ x: point.x + dx, y: point.y + dy }),
  )
}

export function transformPercentPolygon(
  points: VenueMapPoint[],
  live: LiveTransform,
): VenueMapPoint[] {
  const canvas = polygonToCanvas(points)
  const next =
    live.type === "move"
      ? canvas.map((point) => ({ x: point.x + live.dx, y: point.y + live.dy }))
      : live.type === "scale"
        ? canvas.map((point) => ({
            x: live.ox + (point.x - live.ox) * (live.scaleX ?? live.scale),
            y: live.oy + (point.y - live.oy) * (live.scaleY ?? live.scale),
          }))
        : canvas.map((point) =>
            rotatePoint(point.x, point.y, live.cx, live.cy, live.deg),
          )
  return next.map(canvasPointToPercent)
}

export function isCloseToFirstVertex(
  points: VenueMapPoint[],
  candidate: VenueMapPoint,
  threshold = CLOSE_SNAP_PX,
): boolean {
  const first = points[0]
  if (!first || points.length < 3) return false
  return Math.hypot(candidate.x - first.x, candidate.y - first.y) <= threshold
}

export function polygonSvgPoints(points: VenueMapPoint[]): string {
  return polygonToCanvas(points)
    .map((point) => `${point.x},${point.y}`)
    .join(" ")
}

/**
 * Raycasting even-odd. `point` and `polygon` must share the same space.
 * A closed last=first vertex is ignored as a duplicate.
 */
export function isPointInPolygon(
  point: VenueMapPoint,
  polygon: readonly VenueMapPoint[],
): boolean {
  if (polygon.length < 3) return false
  const last = polygon[polygon.length - 1]!
  const first = polygon[0]!
  const closed =
    last.x === first.x && last.y === first.y ? polygon.length - 1 : polygon.length
  if (closed < 3) return false
  let inside = false
  for (let i = 0, j = closed - 1; i < closed; j = i, i += 1) {
    const a = polygon[i]!
    const b = polygon[j]!
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x <
        ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

/** Mesa/butaca in canvas pixels vs zone vertices stored as % or pixels. */
export function isCanvasPointInZonePolygon(
  point: VenueMapPoint,
  polygon: readonly VenueMapPoint[],
  space?: VenuePolygonSpace | null,
): boolean {
  return isPointInPolygon(point, polygonToCanvas([...polygon], space))
}

export function zoneIdContainingCanvasPoint(
  point: VenueMapPoint,
  zones: readonly Pick<VenueMapZone, "id" | "polygon" | "polygonSpace">[],
  skipId?: string | null,
): string | null {
  for (let i = zones.length - 1; i >= 0; i -= 1) {
    const zone = zones[i]!
    if (skipId && zone.id === skipId) continue
    if (isCanvasPointInZonePolygon(point, zone.polygon, zone.polygonSpace)) {
      return zone.id
    }
  }
  return null
}

export function zoneIdFromEventTarget(target: EventTarget | null): string | null {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return null
  }
  return target.closest("[data-zone-id]")?.getAttribute("data-zone-id") ?? null
}

export function zoneIdFromClientPoint(
  clientX: number,
  clientY: number,
): string | null {
  if (typeof document === "undefined") return null
  return zoneIdFromEventTarget(document.elementFromPoint(clientX, clientY))
}

export function zoneCanvasCentroid(zone: Pick<VenueMapZone, "polygon">): {
  x: number
  y: number
} {
  const points = polygonToCanvas(zone.polygon)
  if (points.length === 0) return { x: 0, y: 0 }
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  )
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  }
}
