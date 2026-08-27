import { hasInteractiveVenueMap } from "@/lib/seating/venue-map-geometry"
import type { InteractiveVenueMap } from "@/types/venue-map"

export type PublishedDayVenueMap = {
  eventDateId?: string | null
  map: InteractiveVenueMap
}

/**
 * Multi-day events must show the map of the selected jornada.
 * If per-day maps exist, never fall back to the venue-global first-day map.
 */
export function resolveLiveVenueMapForDay(input: {
  selectedDateId?: string | null
  scheduleDayCount: number
  seatingMaps?: PublishedDayVenueMap[] | null
  fallback?: InteractiveVenueMap | null
}): InteractiveVenueMap | null {
  const maps = input.seatingMaps ?? []
  const fallback = hasInteractiveVenueMap(input.fallback)
    ? input.fallback
    : null

  if (input.scheduleDayCount >= 2) {
    if (maps.length === 0) return fallback ?? null
    const dateId = input.selectedDateId?.trim() ?? ""
    if (!dateId) return null
    const match = maps.find((item) => item.eventDateId === dateId)?.map
    return hasInteractiveVenueMap(match) ? match : null
  }

  const dateId = input.selectedDateId?.trim() ?? ""
  if (dateId) {
    const match = maps.find((item) => item.eventDateId === dateId)?.map
    if (hasInteractiveVenueMap(match)) return match
  }
  const undated = maps.find((item) => !item.eventDateId?.trim())?.map
  if (hasInteractiveVenueMap(undated)) return undated
  const only = maps.length === 1 ? maps[0]?.map : null
  if (hasInteractiveVenueMap(only)) return only
  return fallback
}
