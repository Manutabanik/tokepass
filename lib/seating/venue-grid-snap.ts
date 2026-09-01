import { snapToGrid, VENUE_GRID_SIZE } from "@/lib/seating/venue-transform"

export { VENUE_GRID_SIZE }

/** Shift inverts the magnetic-snap preference instead of enabling it. */
export function magneticSnapActive(
  magneticOn: boolean,
  shiftOverride: boolean,
): boolean {
  return shiftOverride ? !magneticOn : magneticOn
}

export function snapPointToGrid(
  point: { x: number; y: number },
  enabled: boolean,
  grid = VENUE_GRID_SIZE,
): { x: number; y: number } {
  if (!enabled) return point
  return {
    x: snapToGrid(point.x, grid),
    y: snapToGrid(point.y, grid),
  }
}
