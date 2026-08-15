"use server"

import { searchArtists } from "@/app/actions/artists"
import { sanitizeArtistQuery } from "@/lib/artists"
import {
  buildCatalogSearchOr,
  isMissingArtistSchema,
  sanitizeCatalogSearch,
} from "@/lib/discovery-artists"
import { logger } from "@/lib/logger"
import {
  OMNI_SEARCH_LIMIT,
  OMNI_SEARCH_MIN_CHARS,
  type OmniArtistHit,
  type OmniEventHit,
  type OmniSearchResult,
} from "@/lib/omni-search"
import { createClient } from "@/lib/supabase/server"

function sanitizeOmniQuery(query: string): string {
  return sanitizeArtistQuery(query).replace(/[,.()\\]/g, "")
}

async function searchPublishedEventsLight(
  needle: string,
): Promise<OmniEventHit[]> {
  try {
    const supabase = await createClient()
    const safeNeedle = sanitizeCatalogSearch(needle)
    if (!safeNeedle) return []

    let artistEventIds: string[] = []
    const artistNameMatch = await supabase
      .from("event_artists")
      .select("event_id, artists!inner(name)")
      .ilike("artists.name", `%${safeNeedle}%`)
      .limit(OMNI_SEARCH_LIMIT)

    if (artistNameMatch.error) {
      if (!isMissingArtistSchema(artistNameMatch.error.message)) {
        logger.error({
          context: "public-search",
          message: "omni_events_artist_name_failed",
          error: artistNameMatch.error,
        })
      }
    } else {
      artistEventIds = [
        ...new Set(
          (artistNameMatch.data ?? [])
            .map((row) => (row.event_id as string | null)?.trim() || "")
            .filter(Boolean),
        ),
      ]
    }

    const { data, error } = await supabase
      .from("events")
      .select(
        "id, slug, title, date, location, image_url, flyer_url, venues(name, location)",
      )
      .eq("status", "published")
      .eq("visibility", "public")
      .or(buildCatalogSearchOr(safeNeedle, artistEventIds))
      .order("date", { ascending: true })
      .limit(OMNI_SEARCH_LIMIT)

    if (error) {
      logger.error({
        context: "public-search",
        message: "omni_events_failed",
        error,
      })
      return []
    }

    return (data ?? []).map((row) => {
      const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues
      return {
        id: row.id,
        slug: (row.slug?.trim() || row.id) as string,
        title: row.title ?? "",
        date: row.date ?? "",
        location: venue?.name || venue?.location || row.location || "",
        imageUrl: row.flyer_url ?? row.image_url ?? null,
      }
    })
  } catch (error) {
    logger.error({
      context: "public-search",
      message: "omni_events_unexpected",
      error,
    })
    return []
  }
}

async function countActiveEventsByArtistIds(
  artistIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(
    artistIds.map((id) => [id, 0]),
  )
  if (artistIds.length === 0) return counts

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("event_artists")
      .select("artist_id, events!inner(status, visibility)")
      .in("artist_id", artistIds)
      .eq("events.status", "published")
      .eq("events.visibility", "public")

    if (error) {
      if (!isMissingArtistSchema(error.message)) {
        logger.error({
          context: "public-search",
          message: "omni_artist_counts_failed",
          error,
        })
      }
      return counts
    }

    for (const row of data ?? []) {
      const artistId = row.artist_id as string | null
      if (!artistId) continue
      counts[artistId] = (counts[artistId] ?? 0) + 1
    }
    return counts
  } catch (error) {
    logger.error({
      context: "public-search",
      message: "omni_artist_counts_unexpected",
      error,
    })
    return counts
  }
}

/** Búsqueda paralela de eventos publicados y artistas (catálogo B2C). */
export async function searchOmnichannel(
  query: string,
): Promise<OmniSearchResult> {
  try {
    const needle = sanitizeOmniQuery(query)
    if (needle.length < OMNI_SEARCH_MIN_CHARS) {
      return { events: [], artists: [] }
    }

    const [events, artistsResult] = await Promise.all([
      searchPublishedEventsLight(needle),
      searchArtists(needle),
    ])

    const artistHits = artistsResult.data ?? []
    const limitedArtists = artistHits.slice(0, OMNI_SEARCH_LIMIT)
    const counts = await countActiveEventsByArtistIds(
      limitedArtists.map((artist) => artist.id).filter(Boolean),
    )

    return {
      events,
      artists: limitedArtists.map((artist) => ({
        id: artist.id,
        name: artist.name?.trim() || "Artista",
        imageUrl: artist.imageUrl ?? null,
        activeEventCount: counts[artist.id] ?? 0,
      })),
    }
  } catch (error) {
    logger.error({
      context: "public-search",
      message: "omni_search_unexpected",
      error,
    })
    return { events: [], artists: [] }
  }
}
