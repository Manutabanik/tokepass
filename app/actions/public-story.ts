"use server"

import { eventArtistsToLineup, visibleLineupArtists } from "@/lib/event-lineup"
import { isEventUuid } from "@/lib/seo/site"
import type { StoryFlyerData } from "@/lib/story-canvas"
import { fetchImageAsDataUrl } from "@/lib/story-image-proxy"
import { createClient } from "@/lib/supabase/server"

export type StoryHeadliner = {
  name: string
  imageUrl: string | null
}

export async function getPublicStoryHeadliner(
  eventId: string,
): Promise<StoryHeadliner | null> {
  if (!isEventUuid(eventId)) return null

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

  if (query.error) return null

  const lineup = eventArtistsToLineup(query.data ?? [])
  const featured =
    visibleLineupArtists(lineup.artists).featured[0] ?? lineup.artists[0]
  if (!featured?.name) return null

  return {
    name: featured.name,
    imageUrl: featured.imageUrl,
  }
}

export async function getStoryCardData(
  input: StoryFlyerData,
): Promise<StoryFlyerData> {
  let next = { ...input }
  if (!next.artistName?.trim() && next.eventId?.trim()) {
    const artist = await getPublicStoryHeadliner(next.eventId.trim())
    if (artist) {
      next = {
        ...next,
        artistName: next.artistName || artist.name,
        artistImageUrl: next.artistImageUrl || artist.imageUrl,
      }
    }
  }

  const [imageUrl, artistImageUrl, organizerAvatarUrl] = await Promise.all([
    fetchImageAsDataUrl(next.imageUrl),
    fetchImageAsDataUrl(next.artistImageUrl),
    fetchImageAsDataUrl(next.organizerAvatarUrl),
  ])

  return {
    ...next,
    imageUrl,
    artistImageUrl,
    organizerAvatarUrl,
  }
}
