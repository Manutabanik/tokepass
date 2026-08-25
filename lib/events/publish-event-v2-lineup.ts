import {
  isArtistUuid,
  normalizeSpotifyId,
  type LineupDraftItem,
} from "@/lib/artists"
import {
  createDraftLineupItem,
  type EventDraftV2LineupItem,
} from "@/lib/validations/event-draft-v2"

export type LiveEventArtistRowV2 = {
  artist_id?: string | null
  stage?: string | null
  sort_order?: number | null
  artists?:
    | {
        id?: string | null
        name?: string | null
        image_url?: string | null
        spotify_id?: string | null
      }
    | Array<{
        id?: string | null
        name?: string | null
        image_url?: string | null
        spotify_id?: string | null
      }>
    | null
}

export function draftLineupToLineupDraftItems(
  lineup: EventDraftV2LineupItem[],
): LineupDraftItem[] {
  return lineup.flatMap((item, index) => {
    const name = item.name.trim()
    if (!name) return []
    const id = item.id.trim()
    const local = item.source === "local" && isArtistUuid(id)
    const spotify = item.source === "spotify"
    return [
      {
        id,
        artistId: local ? id : null,
        lineupEntryId: null,
        spotifyId: spotify ? normalizeSpotifyId(id) : null,
        name,
        imageUrl: item.avatarUrl.trim() || null,
        genre: null,
        performanceTime: "",
        stage: item.role.trim(),
        order: index,
        isHeadliner: false,
        topTrackPreviewUrl: null,
        topTrackName: null,
      },
    ]
  })
}

export function eventArtistRowsToDraftLineup(
  rows: LiveEventArtistRowV2[],
): EventDraftV2LineupItem[] {
  return rows
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .flatMap((row) => {
      const nested = Array.isArray(row.artists) ? row.artists[0] : row.artists
      const artistId = (nested?.id ?? row.artist_id ?? "").trim()
      const spotifyId = (nested?.spotify_id ?? "").trim()
      const name = (nested?.name ?? "").trim()
      if (!name && !artistId) return []
      return [
        createDraftLineupItem({
          id: spotifyId || artistId,
          name: name || "Artista",
          avatarUrl: nested?.image_url?.trim() || "",
          role: (row.stage ?? "").trim(),
          source: spotifyId ? "spotify" : artistId ? "local" : "custom",
          dayIds: [],
        }),
      ]
    })
}
