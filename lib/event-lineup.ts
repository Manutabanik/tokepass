import { parseDateTimeLocal, toDatetimeLocalInput } from "@/lib/event-schedule"
import { isPlayablePreviewUrl } from "@/lib/spotify/map"
import { isSpotifyArtistId } from "@/lib/spotify/embed"
import type { ScheduleDay } from "@/types/events"

export type EventLineupArtist = {
  id: string
  name: string
  imageUrl: string | null
  role: string | null
  performanceTime: string | null
  /** Jornada del schedule; null = grilla general / sin asignar. */
  dayId: string | null
  isHeadliner: boolean
  spotifyId: string | null
  topTrackPreviewUrl: string | null
  topTrackName: string | null
}

export function hasArtistAudioPreview(
  artist: Pick<EventLineupArtist, "topTrackPreviewUrl">,
): boolean {
  return isPlayablePreviewUrl(artist.topTrackPreviewUrl)
}

export function hasArtistSpotifyPlayer(
  artist: Pick<EventLineupArtist, "spotifyId">,
): boolean {
  return isSpotifyArtistId(artist.spotifyId)
}

export const LINEUP_HEADLINER_FALLBACK = 4

export type EventLineupSlot = {
  id: string
  time: string
  title: string
  description: string | null
}

export type EventLineupData = {
  artists: EventLineupArtist[]
  slots: EventLineupSlot[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function readImage(row: Record<string, unknown>): string | null {
  return (
    text(row.imageUrl) ||
    text(row.image_url) ||
    text(row.photo) ||
    text(row.avatar) ||
    text(row.avatarUrl) ||
    null
  )
}

function readTime(row: Record<string, unknown>): string | null {
  return (
    text(row.time) ||
    text(row.start_time) ||
    text(row.startTime) ||
    text(row.starts_at) ||
    null
  )
}

function readPreviewUrl(row: Record<string, unknown>): string | null {
  return (
    text(row.topTrackPreviewUrl) ||
    text(row.top_track_preview_url) ||
    text(row.previewUrl) ||
    text(row.preview_url) ||
    null
  )
}

function readPreviewName(row: Record<string, unknown>): string | null {
  return (
    text(row.topTrackName) ||
    text(row.top_track_name) ||
    text(row.trackName) ||
    text(row.track_name) ||
    null
  )
}

function readSpotifyId(row: Record<string, unknown>): string | null {
  const value = text(row.spotifyId) || text(row.spotify_id)
  return isSpotifyArtistId(value) ? value.trim() : null
}

function readHeadliner(row: Record<string, unknown>): boolean {
  const value = row.isHeadliner ?? row.is_headliner
  return value === true || value === 1 || value === "true"
}

function parseArtist(
  raw: unknown,
  index: number,
): EventLineupArtist | null {
  const row = asRecord(raw)
  if (!row) return null
  const name = text(row.name) || text(row.artist) || text(row.title)
  if (!name) return null
  return {
    id: text(row.id) || `artist-${index}`,
    name,
    imageUrl: readImage(row),
    role: text(row.role) || text(row.subtitle) || text(row.description),
    performanceTime: readTime(row),
    dayId: text(row.dayId) || text(row.day_id) || text(row.dateId),
    isHeadliner: readHeadliner(row),
    spotifyId: readSpotifyId(row),
    topTrackPreviewUrl: readPreviewUrl(row),
    topTrackName: readPreviewName(row),
  }
}

function parseSlot(raw: unknown, index: number): EventLineupSlot | null {
  const row = asRecord(raw)
  if (!row) return null
  const time = readTime(row)
  const title = text(row.title) || text(row.name) || text(row.artist)
  if (!time || !title) return null
  return {
    id: text(row.id) || `slot-${index}`,
    time,
    title,
    description: text(row.description) || text(row.role) || text(row.subtitle),
  }
}

export function parseEventLineup(raw: unknown): EventLineupData {
  const empty: EventLineupData = { artists: [], slots: [] }
  if (!raw) return empty

  if (Array.isArray(raw)) {
  return attachPerformanceTimes({
    artists: raw
      .map((item, index) => parseArtist(item, index))
      .filter((item): item is EventLineupArtist => Boolean(item)),
    slots: raw
      .map((item, index) => parseSlot(item, index))
      .filter((item): item is EventLineupSlot => Boolean(item)),
  })
}

  const row = asRecord(raw)
  if (!row) return empty

  const artistSource = Array.isArray(row.artists)
    ? row.artists
    : Array.isArray(row.lineup)
      ? row.lineup
      : []
  const slotSource = Array.isArray(row.schedule)
    ? row.schedule
    : Array.isArray(row.slots)
      ? row.slots
      : Array.isArray(row.timeline)
        ? row.timeline
        : []

  return attachPerformanceTimes({
    artists: artistSource
      .map((item, index) => parseArtist(item, index))
      .filter((item): item is EventLineupArtist => Boolean(item)),
    slots: slotSource
      .map((item, index) => parseSlot(item, index))
      .filter((item): item is EventLineupSlot => Boolean(item)),
  })
}

export function hasEventLineup(data: EventLineupData): boolean {
  return data.artists.length > 0 || data.slots.length > 0
}

export function visibleLineupArtists(artists: EventLineupArtist[]): {
  featured: EventLineupArtist[]
  remainingCount: number
} {
  const headliners = artists.filter((artist) => artist.isHeadliner)
  const featured =
    headliners.length > 0
      ? headliners
      : artists.slice(0, LINEUP_HEADLINER_FALLBACK)
  return {
    featured,
    remainingCount: Math.max(0, artists.length - featured.length),
  }
}

function artistFromJoin(raw: unknown): EventLineupArtist | null {
  const row = asRecord(raw)
  if (!row) return null
  const nested = asRecord(row.artists) ?? asRecord(row.artist)
  const name =
    text(nested?.name) ||
    text(row.name) ||
    text(row.artist_name)
  if (!name) return null
  return {
    id: text(nested?.id) || text(row.artist_id) || text(row.id) || name,
    name,
    imageUrl: readImage(nested ?? {}) || readImage(row),
    role: text(row.stage) || text(nested?.bio) || text(row.bio),
    performanceTime: text(row.performance_time) || readTime(row),
    dayId: text(row.day_id) || text(row.dayId) || text(row.dateId),
    isHeadliner: readHeadliner(row),
    spotifyId: readSpotifyId(nested ?? {}) || readSpotifyId(row),
    topTrackPreviewUrl:
      readPreviewUrl(nested ?? {}) || readPreviewUrl(row),
    topTrackName: readPreviewName(nested ?? {}) || readPreviewName(row),
  }
}

export function eventArtistsToLineup(rows: unknown): EventLineupData {
  if (!Array.isArray(rows)) return { artists: [], slots: [] }

  const sorted = [...rows].sort((left, right) => {
    const leftRow = asRecord(left)
    const rightRow = asRecord(right)
    const leftOrder = Number(leftRow?.sort_order ?? leftRow?.order ?? 0)
    const rightOrder = Number(rightRow?.sort_order ?? rightRow?.order ?? 0)
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    const leftTime = text(leftRow?.performance_time) || ""
    const rightTime = text(rightRow?.performance_time) || ""
    return leftTime.localeCompare(rightTime)
  })

  const artists: EventLineupArtist[] = []
  const seen = new Set<string>()
  const slots: EventLineupSlot[] = []

  sorted.forEach((item, index) => {
    const artist = artistFromJoin(item)
    const artistKey = artist ? `${artist.id}:${artist.dayId ?? ""}` : ""
    if (artist && !seen.has(artistKey)) {
      seen.add(artistKey)
      artists.push(artist)
    }

    const row = asRecord(item)
    const time =
      text(row?.performance_time) ||
      readTime(row ?? {})
    if (!artist || !time) return
    slots.push({
      id: text(row?.id) || `slot-${index}`,
      time,
      title: artist.name,
      description: text(row?.stage) || artist.role,
    })
  })

  return attachPerformanceTimes({ artists, slots })
}

function calendarDayKey(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  const local = toDatetimeLocalInput(raw)
  return local ? local.slice(0, 10) : null
}

export function resolveLineupArtistDayId(
  artist: Pick<EventLineupArtist, "dayId" | "performanceTime">,
  scheduleDays: ScheduleDay[],
): string | null {
  const explicit = artist.dayId?.trim()
  if (explicit) return explicit
  if (scheduleDays.length === 0) return null

  const raw = artist.performanceTime?.trim()
  if (!raw) return null
  const parsed = parseDateTimeLocal(raw) ?? new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null

  const ts = parsed.getTime()
  const inWindow = scheduleDays.find((day) => {
    const start = new Date(day.start_time).getTime()
    const end = new Date(day.end_time).getTime()
    return ts >= start && ts < end
  })
  if (inWindow) return inWindow.id

  const key = calendarDayKey(parsed.toISOString())
  if (!key) return null
  return (
    scheduleDays.find((day) => calendarDayKey(day.start_time) === key)?.id ??
    null
  )
}

export function filterLineupByDay(
  data: EventLineupData,
  selectedDayId: string | null | undefined,
  scheduleDays: ScheduleDay[] = [],
): EventLineupData {
  if (!selectedDayId || selectedDayId === "all" || scheduleDays.length < 2) {
    return data
  }
  const hasBindings = data.artists.some((artist) =>
    resolveLineupArtistDayId(artist, scheduleDays),
  )
  if (!hasBindings) return data

  return {
    ...data,
    artists: data.artists.filter(
      (artist) =>
        resolveLineupArtistDayId(artist, scheduleDays) === selectedDayId,
    ),
    slots: data.slots.filter((slot) => {
      const inferred = resolveLineupArtistDayId(
        { dayId: null, performanceTime: slot.time },
        scheduleDays,
      )
      return !inferred || inferred === selectedDayId
    }),
  }
}

function attachPerformanceTimes(data: EventLineupData): EventLineupData {
  const timeByName = new Map(
    data.slots.map((slot) => [slot.title.trim().toLowerCase(), slot.time]),
  )
  return {
    ...data,
    artists: data.artists.map((artist) => ({
      ...artist,
      performanceTime:
        artist.performanceTime ||
        timeByName.get(artist.name.trim().toLowerCase()) ||
        null,
    })),
  }
}
