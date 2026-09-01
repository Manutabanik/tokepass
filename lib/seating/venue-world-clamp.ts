import {
  canvasPointToPercent,
  polygonToCanvas,
  VENUE_MAP_CANVAS,
} from "@/lib/seating/venue-polygon"

export const VENUE_WORLD_MARGIN = 24

export function clampWorldCoord(
  value: number,
  size: number,
  margin = VENUE_WORLD_MARGIN,
): number {
  if (!Number.isFinite(value)) return 0
  const min = -margin
  const max = size + margin
  if (value < min) return min
  if (value > max) return max
  return value
}

export function clampWorldPoint<T extends { x: number; y: number }>(
  point: T,
  world: { width: number; height: number } = VENUE_MAP_CANVAS,
  margin = VENUE_WORLD_MARGIN,
): T {
  const x = clampWorldCoord(point.x, world.width, margin)
  const y = clampWorldCoord(point.y, world.height, margin)
  if (x === point.x && y === point.y) return point
  return { ...point, x, y }
}

export function clampPercentPolygon(
  polygon: Array<{ x: number; y: number }>,
  world: { width: number; height: number } = VENUE_MAP_CANVAS,
  margin = VENUE_WORLD_MARGIN,
) {
  return polygonToCanvas(polygon).map((point) =>
    canvasPointToPercent(clampWorldPoint(point, world, margin)),
  )
}
