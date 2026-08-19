import type { InteractiveVenueMap } from "@/types/venue-map"

export const VENUE_MAP_HISTORY_LIMIT = 40

export function cloneVenueMapState(
  map: InteractiveVenueMap,
): InteractiveVenueMap {
  return structuredClone(map)
}

export function pushVenueMapPast(
  past: InteractiveVenueMap[],
  current: InteractiveVenueMap,
  limit = VENUE_MAP_HISTORY_LIMIT,
): InteractiveVenueMap[] {
  const next = [...past, cloneVenueMapState(current)]
  if (next.length <= limit) return next
  return next.slice(next.length - limit)
}

export function takeVenueMapUndo(
  past: InteractiveVenueMap[],
  future: InteractiveVenueMap[],
  current: InteractiveVenueMap,
): {
  past: InteractiveVenueMap[]
  future: InteractiveVenueMap[]
  current: InteractiveVenueMap
} | null {
  if (past.length === 0) return null
  const previous = past[past.length - 1]!
  return {
    past: past.slice(0, -1),
    future: [...future, cloneVenueMapState(current)],
    current: previous,
  }
}

export function takeVenueMapRedo(
  past: InteractiveVenueMap[],
  future: InteractiveVenueMap[],
  current: InteractiveVenueMap,
): {
  past: InteractiveVenueMap[]
  future: InteractiveVenueMap[]
  current: InteractiveVenueMap
} | null {
  if (future.length === 0) return null
  const next = future[future.length - 1]!
  return {
    past: [...past, cloneVenueMapState(current)],
    future: future.slice(0, -1),
    current: next,
  }
}
