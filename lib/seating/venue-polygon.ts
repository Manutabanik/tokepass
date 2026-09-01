import { rotatePoint } from "@/lib/seating/venue-element-geometry"
import type { LiveTransform } from "@/lib/seating/venue-transform"
import type { VenueMapPoint, VenueMapZone } from "@/types/venue-map"

export const VENUE_MAP_CANVAS = { width: 800, height: 560 } as const

const CLOSE_SNAP_PX = 14

/**
 * Percent space may overflow the 800×560 world (expanded viewBox padding).
 * Only treat a vertex as canvas pixels when it cannot be a % overflow.
 */
export const VENUE_PERCENT_OVERFLOW_MAX = 140

export function roundMapCoord(value: number, digits = 3): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function polygonLooksLikePixels(points: VenueMapPoint[]): boolean {
  return points.some(
    (point) =>
      point.x > VENUE_PERCENT_OVERFLOW_MAX ||
      point.y > VENUE_PERCENT_OVERFLOW_MAX,
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

export function normalizePolygonToPercent(
  points: VenueMapPoint[],
): VenueMapPoint[] {
  if (points.length === 0) return points
  if (!polygonLooksLikePixels(points)) {
    return points.map((point) => ({
      x: roundMapCoord(point.x),
      y: roundMapCoord(point.y),
    }))
  }
  return polygonFromCanvas(points)
}

export function polygonToCanvas(points: VenueMapPoint[]): VenueMapPoint[] {
  if (points.length === 0) return points
  if (polygonLooksLikePixels(points)) return points
  return points.map(percentPointToCanvas)
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
