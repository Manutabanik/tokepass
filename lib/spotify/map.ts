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
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null
  return trimmed
}

export function mapSpotifyTopTrack(tracks: unknown): SpotifyTopTrack {
  if (!Array.isArray(tracks)) {
    return { previewUrl: null, trackName: null }
  }

  let firstName: string | null = null
  for (const item of tracks) {
    const row = asTrackRecord(item)
    if (!row) continue
    const name = typeof row.name === "string" ? row.name.trim() : ""
    if (name && !firstName) firstName = name
    const previewUrl = httpUrl(row.preview_url)
    if (previewUrl) {
      return { previewUrl, trackName: name || firstName }
    }
  }

  return { previewUrl: null, trackName: firstName }
}
