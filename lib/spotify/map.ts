export type SpotifyArtistHit = {
  spotifyId: string
  name: string
  imageUrl: string | null
  genres: string[]
}

export type SpotifyTopTrack = {
  previewUrl: string | null
  trackName: string | null
}

export type SpotifyTrackCandidate = {
  id: string | null
  name: string | null
  previewUrl: string | null
}

export const SPOTIFY_TOP_TRACK_LIMIT = 10

export function isPlayablePreviewUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return false
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
}

export function isSuccessfulSpotifyStatus(status: number): boolean {
  return status === 200 || status === 201
}

type SpotifyImage = {
  url?: unknown
  width?: unknown
}

export type SpotifyArtistItem = {
  id?: unknown
  name?: unknown
  images?: unknown
  genres?: unknown
}

export function pickSpotifyArtistImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const usable = images
    .map((item) => {
      const row = item as SpotifyImage
      const url = typeof row.url === "string" ? row.url.trim() : ""
      if (!url.startsWith("http://") && !url.startsWith("https://")) return null
      const width = typeof row.width === "number" ? row.width : null
      return { url, width }
    })
    .filter((item): item is { url: string; width: number | null } => Boolean(item))

  if (usable.length === 0) return null

  const medium = usable.find((item) => item.width === 300)
  if (medium) return medium.url

  const closest = [...usable].sort((left, right) => {
    const leftDelta = Math.abs((left.width ?? 9999) - 300)
    const rightDelta = Math.abs((right.width ?? 9999) - 300)
    return leftDelta - rightDelta
  })[0]
  return closest?.url ?? usable[0]!.url
}

export function mapSpotifyArtist(item: SpotifyArtistItem): SpotifyArtistHit | null {
  const spotifyId = typeof item.id === "string" ? item.id.trim() : ""
  const name = typeof item.name === "string" ? item.name.trim() : ""
  if (!spotifyId || !name) return null
  const genres = Array.isArray(item.genres)
    ? item.genres.filter(
        (genre): genre is string => typeof genre === "string" && genre.trim().length > 0,
      )
    : []
  return {
    spotifyId,
    name,
    imageUrl: pickSpotifyArtistImage(item.images),
    genres,
  }
}

function asTrackRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function httpUrl(value: unknown): string | null {
  return isPlayablePreviewUrl(value) ? value.trim() : null
}

export function listSpotifyTrackCandidates(
  tracks: unknown,
  limit = SPOTIFY_TOP_TRACK_LIMIT,
): SpotifyTrackCandidate[] {
  if (!Array.isArray(tracks)) return []
  const out: SpotifyTrackCandidate[] = []
  for (const item of tracks) {
    if (out.length >= limit) break
    const row = asTrackRecord(item)
    if (!row) continue
    const name = typeof row.name === "string" ? row.name.trim() : ""
    const id = typeof row.id === "string" ? row.id.trim() : ""
    out.push({
      id: id || null,
      name: name || null,
      previewUrl: httpUrl(row.preview_url),
    })
  }
  return out
}

export function mapSpotifyTopTrack(tracks: unknown): SpotifyTopTrack {
  const candidates = listSpotifyTrackCandidates(tracks)
  const hit = candidates.find((item) => item.previewUrl)
  if (hit?.previewUrl) {
    return { previewUrl: hit.previewUrl, trackName: hit.name }
  }
  return { previewUrl: null, trackName: candidates[0]?.name ?? null }
}

export function parseSpotifyEmbedPreview(html: string): string | null {
  if (!html) return null
  const decoded = html
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
  const patterns = [
    /"audioPreview"\s*:\s*\{\s*"url"\s*:\s*"(https:[^"]+)"/i,
    /"preview_url"\s*:\s*"(https:[^"]+)"/i,
    /(https:\/\/p\.scdn\.co\/mp3-preview\/[A-Za-z0-9._-]+)/i,
  ]
  for (const pattern of patterns) {
    const match = decoded.match(pattern)
    const url = match?.[1]?.replace(/\\/g, "").trim()
    if (isPlayablePreviewUrl(url)) return url
  }
  return null
}
