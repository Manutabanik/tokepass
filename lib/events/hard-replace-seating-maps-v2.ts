import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { createAdminClient } from "@/lib/supabase/admin"
import type { PublishEventV2SeatingMap } from "@/lib/events/publish-event-v2"

const MISSING_SEATING_MAPS_RE =
  /seating_maps|event_date_id|schema cache|PGRST205|PGRST204|42P01|42703/i

/**
 * Hard replace of per-day map instances.
 * `event_date_id` is the jornada (`event_schedules.id`). There is no
 * `event_dates` table — the draft `dateId` maps to that column.
 */
export async function hardReplacePublishedSeatingMaps(input: {
  eventId: string
  maps: PublishEventV2SeatingMap[]
}): Promise<void> {
  const admin = createAdminClient()
  const deleted = await admin
    .from("seating_maps")
    .delete()
    .eq("event_id", input.eventId)
  if (deleted.error) {
    if (MISSING_SEATING_MAPS_RE.test(deleted.error.message)) return
    throw new Error(formatSupabaseError(deleted.error))
  }

  if (input.maps.length === 0) return

  const days = await admin
    .from("event_schedules")
    .select("id")
    .eq("event_id", input.eventId)
  if (days.error) throw new Error(formatSupabaseError(days.error))
  const dayIds = new Set((days.data ?? []).map((row) => row.id))

  for (const item of input.maps) {
    const eventDateId =
      item.event_date_id && dayIds.has(item.event_date_id)
        ? item.event_date_id
        : null
    const inserted = await admin.from("seating_maps").insert({
      event_id: input.eventId,
      event_date_id: eventDateId,
      map_config: item.map_config,
      pricing: item.pricing,
      updated_at: new Date().toISOString(),
    })
    if (inserted.error) {
      if (MISSING_SEATING_MAPS_RE.test(inserted.error.message)) return
      throw new Error(formatSupabaseError(inserted.error))
    }
  }
}
