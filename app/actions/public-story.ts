"use server"

import { eventArtistsToLineup, visibleLineupArtists } from "@/lib/event-lineup"
import { parseScheduleDays } from "@/lib/event-schedule"
import { isEventUuid } from "@/lib/seo/site"
import {
  STORY_LINEUP_AVATAR_MAX,
  type StoryFlyerData,
  type StoryLineupArtist,
} from "@/lib/story-canvas"
import { fetchImageAsDataUrl } from "@/lib/story-image-proxy"
import { createClient } from "@/lib/supabase/server"

export type StoryHeadliner = {
  name: string
  imageUrl: string | null
}

async function loadEventLineupArtists(eventId: string) {
  if (!isEventUuid(eventId)) return []

  const supabase = await createClient()
  const withFlag = await supabase
    .from("event_artists")
    .select("is_headliner, sort_order, artists(id, name, image_url)")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .limit(12)

  const query = /is_headliner/i.test(withFlag.error?.message ?? "")
    ? await supabase
        .from("event_artists")
        .select("sort_order, artists(id, name, image_url)")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true })
        .limit(12)
    : withFlag

  if (query.error) return []
  return eventArtistsToLineup(query.data ?? []).artists
}

export async function getPublicStoryHeadliner(
  eventId: string,
): Promise<StoryHeadliner | null> {
  const artists = await loadEventLineupArtists(eventId)
  const featured =
    visibleLineupArtists(artists).featured[0] ?? artists[0]
  if (!featured?.name) return null
  return {
    name: featured.name,
    imageUrl: featured.imageUrl,
  }
}

export async function getPublicStoryLineup(eventId: string): Promise<{
  artists: StoryLineupArtist[]
  remainingCount: number
}> {
  const artists = await loadEventLineupArtists(eventId)
  if (artists.length === 0) return { artists: [], remainingCount: 0 }

  const visible = visibleLineupArtists(artists)
  const pool = visible.featured.length > 0 ? visible.featured : artists
  const shown = pool.slice(0, STORY_LINEUP_AVATAR_MAX).map((artist) => ({
    name: artist.name,
    imageUrl: artist.imageUrl,
  }))

  return {
    artists: shown,
    remainingCount: Math.max(0, artists.length - shown.length),
  }
}

export async function getPublicStoryDates(eventId: string): Promise<string[]> {
  if (!isEventUuid(eventId)) return []

  const supabase = await createClient()
  const query = await supabase
    .from("events")
    .select("date, schedule_days")
    .eq("id", eventId)
    .maybeSingle()

  if (query.error || !query.data) return []

  const days = parseScheduleDays(query.data.schedule_days)
  if (days.length > 0) {
    return days.map((day) => day.start_time).filter(Boolean)
  }
  return query.data.date ? [query.data.date] : []
}

export async function getStoryCardData(
  input: StoryFlyerData,
): Promise<StoryFlyerData> {
  let next = { ...input }
  const eventId = next.eventId?.trim()
  if (eventId) {
    const [lineup, eventDates] = await Promise.all([
      getPublicStoryLineup(eventId),
      getPublicStoryDates(eventId),
    ])
    if (lineup.artists.length > 0) {
      const headliner = lineup.artists[0]
      next = {
        ...next,
        artistName: next.artistName || headliner.name,
        artistImageUrl: next.artistImageUrl || headliner.imageUrl,
        lineupArtists: lineup.artists,
        lineupRemainingCount: lineup.remainingCount,
      }
    }
    if (eventDates.length > 0) {
      next = {
        ...next,
        eventDates,
        eventDate: next.eventDate || eventDates[0],
      }
    }
  }

  const lineup = next.lineupArtists ?? []
  const [imageUrl, organizerAvatarUrl, ...lineupImages] = await Promise.all([
    fetchImageAsDataUrl(next.imageUrl),
    fetchImageAsDataUrl(next.organizerAvatarUrl),
    ...lineup.map((artist) => fetchImageAsDataUrl(artist.imageUrl)),
  ])

  const hydratedLineup = lineup.map((artist, index) => ({
    name: artist.name,
    imageUrl: lineupImages[index] ?? null,
  }))

  return {
    ...next,
    imageUrl,
    artistImageUrl: hydratedLineup[0]?.imageUrl ?? null,
    artistName: next.artistName || hydratedLineup[0]?.name || null,
    organizerAvatarUrl,
    lineupArtists: hydratedLineup,
    lineupRemainingCount: next.lineupRemainingCount ?? 0,
  }
}
