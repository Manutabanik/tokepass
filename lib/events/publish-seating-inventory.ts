import type { Json } from "@/types/database"
import type { PublishEventV2SeatingMap } from "@/lib/events/publish-event-v2"

/**
 * Published seating units come from seating_maps, not from venues.seating_layout,
 * except for classic single-day events that never published a map row.
 */
export function venueLayoutDrivesSeatingUnits(input: {
  scheduleDayCount: number
  hasPublishedSeatingMaps: boolean
}): boolean {
  return input.scheduleDayCount < 2 && !input.hasPublishedSeatingMaps
}

/**
 * A single saved venue_map is only an inventory source for 0–1 jornadas.
 * Multi-day events must write seating_maps per schedule id (editor v2 / publish).
 */
export function seatingMapsFromSavedVenueMap(input: {
  mapConfig: Json
  seatingLayout: Json
  scheduleDayIds: readonly string[]
}):
  | { ok: true; maps: PublishEventV2SeatingMap[] }
  | { ok: false; reason: "multi_day" } {
  if (input.scheduleDayIds.length >= 2) {
    return { ok: false, reason: "multi_day" }
  }
  return {
    ok: true,
    maps: [
      {
        event_date_id: input.scheduleDayIds[0] ?? null,
        map_config: input.mapConfig,
        pricing: {},
        seating_layout: input.seatingLayout,
      },
    ],
  }
}
