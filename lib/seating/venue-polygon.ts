import type { VenueMapPoint, VenueMapZone } from "@/types/venue-map"

export const VENUE_MAP_CANVAS = { width: 800, height: 560 } as const

const CLOSE_SNAP_PX = 14

export function roundMapCoord(value: number, digits = 3): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function polygonLooksLikePixels(points: VenueMapPoint[]): boolean {
  return points.some((point) => point.x > 100.0001 || point.y > 100.0001)
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
  return points.map(canvasPointToPercent)
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
