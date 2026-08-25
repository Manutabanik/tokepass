import {
  isArtistUuid,
  isMissingHeadlinerColumn,
  normalizeArtistName,
  normalizeOptionalUrl,
  normalizeSpotifyId,
  serializeLineupForEvent,
  type LineupDraftItem,
} from "@/lib/artists"
import { formatSupabaseError } from "@/lib/errors/supabase-error"
import { draftLineupToLineupDraftItems } from "@/lib/events/publish-event-v2-lineup"
import { createAdminClient } from "@/lib/supabase/admin"
import type { EventDraftV2LineupItem } from "@/lib/validations/event-draft-v2"

type AdminClient = ReturnType<typeof createAdminClient>

async function selectArtistId(
  admin: AdminClient,
  filter: { column: "id" | "spotify_id"; value: string },
) {
  return admin
    .from("artists")
    .select("id")
    .eq(filter.column, filter.value)
    .maybeSingle()
}

async function ensureArtistForPublish(
  admin: AdminClient,
  item: LineupDraftItem,
): Promise<{ id: string }> {
  if (item.artistId && isArtistUuid(item.artistId)) {
    const existing = await selectArtistId(admin, {
      column: "id",
      value: item.artistId,
    })
    if (existing.data?.id) return { id: existing.data.id }
  }

  const spotifyId = normalizeSpotifyId(item.spotifyId)
  if (spotifyId) {
    const bySpotify = await selectArtistId(admin, {
      column: "spotify_id",
      value: spotifyId,
    })
    if (bySpotify.data?.id) return { id: bySpotify.data.id }
  }

  const name = normalizeArtistName(item.name) ?? item.name.trim()
  if (!name) {
    throw new Error("Hay un artista sin nombre en la grilla.")
  }

  const imageUrl = normalizeOptionalUrl(item.imageUrl)
  const inserted = await admin
    .from("artists")
    .insert({
      name,
      image_url: imageUrl === undefined ? null : imageUrl,
      spotify_id: spotifyId,
    } as never)
    .select("id")
    .single()

  if (inserted.error) {
    if (inserted.error.code === "23505" && spotifyId) {
      const again = await selectArtistId(admin, {
        column: "spotify_id",
        value: spotifyId,
      })
      if (again.data?.id) return { id: again.data.id }
    }
    throw new Error(
      formatSupabaseError(inserted.error) || "No se pudo crear el artista.",
    )
  }

  if (!inserted.data?.id) {
    throw new Error("La base no devolvió el ID del artista.")
  }
  return { id: inserted.data.id }
}

/**
 * Purges `event_artists` for the event, then inserts the draft lineup.
 * Empty lineup still deletes leftovers so the public grid cannot keep stale rows.
 */
export async function hardReplacePublishedEventArtists(input: {
  eventId: string
  lineup: EventDraftV2LineupItem[]
}): Promise<void> {
  const admin = createAdminClient()
  const drafts = draftLineupToLineupDraftItems(input.lineup)

  const deleted = await admin
    .from("event_artists")
    .delete()
    .eq("event_id", input.eventId)
  if (deleted.error) {
    throw new Error(formatSupabaseError(deleted.error))
  }

  const linked: LineupDraftItem[] = []
  for (const item of drafts) {
    const ensured = await ensureArtistForPublish(admin, item)
    linked.push({ ...item, artistId: ensured.id })
  }

  for (const [index, item] of linked.entries()) {
    if (!item.artistId) continue
    const base = {
      event_id: input.eventId,
      artist_id: item.artistId,
      sort_order: index,
      stage: item.stage.trim() || null,
      performance_time: null,
    }
    const inserted = await admin.from("event_artists").insert({
      ...base,
      is_headliner: false,
    })
    if (inserted.error && isMissingHeadlinerColumn(inserted.error.message)) {
      const retry = await admin.from("event_artists").insert(base)
      if (retry.error) throw new Error(formatSupabaseError(retry.error))
    } else if (inserted.error) {
      throw new Error(formatSupabaseError(inserted.error))
    }
  }

  const written = await admin
    .from("events")
    .update({ lineup: serializeLineupForEvent(linked) as never })
    .eq("id", input.eventId)
  if (
    written.error &&
    !/lineup|schema cache|PGRST204|42703/i.test(written.error.message)
  ) {
    throw new Error(formatSupabaseError(written.error))
  }
}
