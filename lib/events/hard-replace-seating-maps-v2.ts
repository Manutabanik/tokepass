import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { createAdminClient } from "@/lib/supabase/admin"
import type { PublishEventV2SeatingMap } from "@/lib/events/publish-event-v2"
import {
  pickUnusedPublishedSeatingMapRow,
  resolveHardReplaceSeatingMapDay,
} from "@/lib/events/published-seating-map-match"

const MISSING_SYNC_RPC_RE =
  /sync_published_seating_maps|Could not find the function|PGRST202|42883/i

export {
  pickUnusedPublishedSeatingMapRow,
  resolveHardReplaceSeatingMapDay,
} from "@/lib/events/published-seating-map-match"

function seatingMapsWriteError(error: { message: string }): Error {
  return new Error(
    /seating_maps|event_date_id|schema cache|PGRST205|PGRST204|42P01|42703/i.test(
      error.message,
    )
      ? "Falta aplicar la migración de mapas por jornada (p160/p172) en Supabase."
      : formatSupabaseError(error),
  )
}

/**
 * Replace per-day map instances without deleting first.
 * Prefers the atomic RPC; if it is not deployed, writes row-by-row and
 * fails closed on schema errors so publish never reports success without maps.
 */
export async function hardReplacePublishedSeatingMaps(input: {
  eventId: string
  maps: PublishEventV2SeatingMap[]
}): Promise<void> {
  const admin = createAdminClient()
  const synced = await admin.rpc("sync_published_seating_maps", {
    p_event_id: input.eventId,
    p_maps: input.maps,
  })
  if (!synced.error) return
  if (!MISSING_SYNC_RPC_RE.test(synced.error.message)) {
    throw new Error(formatSupabaseError(synced.error))
  }

  const existing = await admin
    .from("seating_maps")
    .select("id, event_date_id")
    .eq("event_id", input.eventId)
  if (existing.error) throw seatingMapsWriteError(existing.error)

  const rows = existing.data ?? []
  const keepIds = new Set<string>()

  if (input.maps.length === 0) {
    if (rows.length === 0) return
    const cleared = await admin
      .from("seating_maps")
      .delete()
      .eq("event_id", input.eventId)
    if (cleared.error) throw seatingMapsWriteError(cleared.error)
    return
  }

  const days = await admin
    .from("event_schedules")
    .select("id")
    .eq("event_id", input.eventId)
  if (days.error) throw new Error(formatSupabaseError(days.error))
  const dayIds = new Set((days.data ?? []).map((row) => row.id))

  for (const item of input.maps) {
    const day = resolveHardReplaceSeatingMapDay({
      requested: item.event_date_id,
      dayIds,
    })
    if ("keepRequested" in day) {
      throw new Error(
        "El mapa de una jornada no coincide con el cronograma. Revisá las fechas y publicá de nuevo.",
      )
    }
    const eventDateId = day.writeDateId
    const match = pickUnusedPublishedSeatingMapRow(
      rows,
      eventDateId,
      keepIds,
    )
    const payload = {
      event_id: input.eventId,
      map_config: item.map_config,
      pricing: item.pricing,
      seating_layout: item.seating_layout ?? [],
      updated_at: new Date().toISOString(),
      event_date_id: eventDateId,
    }
    if (match) {
      const written = await admin
        .from("seating_maps")
        .update(payload)
        .eq("id", match.id)
        .eq("event_id", input.eventId)
      if (written.error) throw seatingMapsWriteError(written.error)
      keepIds.add(match.id)
      continue
    }

    const inserted = await admin
      .from("seating_maps")
      .insert(payload)
      .select("id")
      .maybeSingle()
    if (inserted.error) throw seatingMapsWriteError(inserted.error)
    if (inserted.data?.id) keepIds.add(inserted.data.id)
  }

  const stale = rows.filter((row) => !keepIds.has(row.id)).map((row) => row.id)
  if (stale.length === 0) return
  const removed = await admin
    .from("seating_maps")
    .delete()
    .eq("event_id", input.eventId)
    .in("id", stale)
  if (removed.error) throw seatingMapsWriteError(removed.error)
}
