import { isEventUuid } from "@/lib/seo/site"

export type ArtistActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; data?: T }

export type ArtistSearchHit = {
  id: string
  name: string
  imageUrl: string | null
  spotifyId: string | null
}

export type EventLineupItem = {
  id: string
  eventId: string
  artistId: string
  performanceTime: string | null
  stage: string | null
  order: number
  artist: ArtistSearchHit
}

export const ARTIST_SEARCH_LIMIT = 10
export const ARTIST_NAME_MAX = 120

export function sanitizeArtistQuery(query: string): string {
  return query.trim().replace(/[%_]/g, "").slice(0, ARTIST_NAME_MAX)
}

export function normalizeArtistName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const name = value.trim().replace(/\s+/g, " ")
  if (name.length < 1 || name.length > ARTIST_NAME_MAX) return null
  return name
}

export function normalizeOptionalUrl(value: unknown): string | null | undefined {
  if (value == null || value === "") return null
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

export function normalizeSpotifyId(value: unknown): string | null {
  if (value == null || value === "") return null
  if (typeof value !== "string") return null
  const id = value.trim()
  if (!id) return null
  return id.slice(0, 64)
}

export function isArtistUuid(value: string): boolean {
  return isEventUuid(value)
}

export function toPerformanceIso(
  value?: Date | string | null,
): string | null | undefined {
  if (value == null || value === "") return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

export type LineupDraftItem = {
  id: string
  artistId: string | null
  lineupEntryId: string | null
  spotifyId: string | null
  name: string
  imageUrl: string | null
  genre: string | null
  performanceTime: string
  stage: string
  order: number
}

export function performanceTimeToInput(value: string | null | undefined): string {
  if (!value) return ""
  if (/^\d{1,2}:\d{2}$/.test(value.trim())) {
    const [hours, minutes] = value.trim().split(":")
    return `${hours.padStart(2, "0")}:${minutes}`
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return ""
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

export function serializeLineupForEvent(lineup: LineupDraftItem[]) {
  return lineup.map((item, index) => ({
    name: item.name,
    image_url: item.imageUrl,
    role: item.stage || item.genre,
    time: item.performanceTime || null,
    spotify_id: item.spotifyId,
    artist_id: item.artistId,
    order: index,
  }))
}

export function lineupDraftsFromItems(
  items: EventLineupItem[],
): LineupDraftItem[] {
  return items.map((item, index) => ({
    id: item.id,
    artistId: item.artistId,
    lineupEntryId: item.id,
    spotifyId: item.artist.spotifyId,
    name: item.artist.name || "Artista",
    imageUrl: item.artist.imageUrl,
    genre: null,
    performanceTime: performanceTimeToInput(item.performanceTime),
    stage: item.stage ?? "",
    order: Number.isFinite(item.order) ? item.order : index,
  }))
}

export function mapArtistHit(row: {
  id?: string | null
  name?: string | null
  image_url?: string | null
  spotify_id?: string | null
}): ArtistSearchHit {
  return {
    id: row.id?.trim() || "",
    name: row.name?.trim() || "Artista",
    imageUrl: row.image_url?.trim() || null,
    spotifyId: row.spotify_id?.trim() || null,
  }
}

export function mapLineupItem(row: {
  id: string
  event_id: string
  artist_id: string
  performance_time?: string | null
  stage?: string | null
  sort_order?: number
  artists?:
    | {
        id: string
        name: string
        image_url?: string | null
        spotify_id?: string | null
      }
    | Array<{
        id: string
        name: string
        image_url?: string | null
        spotify_id?: string | null
      }>
    | null
}): EventLineupItem {
  const nested = Array.isArray(row.artists) ? row.artists[0] : row.artists
  return {
    id: row.id,
    eventId: row.event_id,
    artistId: row.artist_id,
    performanceTime: row.performance_time ?? null,
    stage: row.stage ?? null,
    order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    artist: mapArtistHit(
      nested ?? {
        id: row.artist_id,
        name: "Artista",
        image_url: null,
        spotify_id: null,
      },
    ),
  }
}
