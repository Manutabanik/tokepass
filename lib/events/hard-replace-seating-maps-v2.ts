import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { createAdminClient } from "@/lib/supabase/admin"
import type { PublishEventV2SeatingMap } from "@/lib/events/publish-event-v2"

const MISSING_SEATING_MAPS_RE =
  /seating_maps|event_date_id|schema cache|PGRST205|PGRST204|42P01|42703/i

/**
 * Replace per-day map instances without deleting first.
 * Updates matching days, inserts missing ones, then removes leftovers so a
 * mid-flight failure cannot leave a published event without maps.
 */
export async function hardReplacePublishedSeatingMaps(input: {
  eventId: string
  maps: PublishEventV2SeatingMap[]
}): Promise<void> {
  const admin = createAdminClient()
  const existing = await admin
    .from("seating_maps")
    .select("id, event_date_id")
    .eq("event_id", input.eventId)
  if (existing.error) {
    if (MISSING_SEATING_MAPS_RE.test(existing.error.message)) return
    throw new Error(formatSupabaseError(existing.error))
  }

  const rows = existing.data ?? []
  const keepIds = new Set<string>()

  if (input.maps.length === 0) {
    if (rows.length === 0) return
    const cleared = await admin
      .from("seating_maps")
      .delete()
      .eq("event_id", input.eventId)
    if (cleared.error) {
      if (MISSING_SEATING_MAPS_RE.test(cleared.error.message)) return
      throw new Error(formatSupabaseError(cleared.error))
    }
    return
  }

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
    const match = rows.find((row) =>
      eventDateId
        ? row.event_date_id === eventDateId
        : row.event_date_id == null,
    )
    const payload = {
      event_id: input.eventId,
      event_date_id: eventDateId,
      map_config: item.map_config,
      pricing: item.pricing,
      updated_at: new Date().toISOString(),
    }
    if (match) {
      const written = await admin
        .from("seating_maps")
        .update(payload)
        .eq("id", match.id)
        .eq("event_id", input.eventId)
      if (written.error) {
        if (MISSING_SEATING_MAPS_RE.test(written.error.message)) return
        throw new Error(formatSupabaseError(written.error))
      }
      keepIds.add(match.id)
      continue
    }

    const inserted = await admin
      .from("seating_maps")
      .insert(payload)
      .select("id")
      .maybeSingle()
    if (inserted.error) {
      if (MISSING_SEATING_MAPS_RE.test(inserted.error.message)) return
      throw new Error(formatSupabaseError(inserted.error))
    }
    if (inserted.data?.id) keepIds.add(inserted.data.id)
  }

  const stale = rows.filter((row) => !keepIds.has(row.id)).map((row) => row.id)
  if (stale.length === 0) return
  const removed = await admin
    .from("seating_maps")
    .delete()
    .eq("event_id", input.eventId)
    .in("id", stale)
  if (removed.error) {
    if (MISSING_SEATING_MAPS_RE.test(removed.error.message)) return
    throw new Error(formatSupabaseError(removed.error))
  }
}
