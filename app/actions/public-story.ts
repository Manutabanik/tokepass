"use server"

import { eventArtistsToLineup, visibleLineupArtists } from "@/lib/event-lineup"
import { isEventUuid } from "@/lib/seo/site"
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
