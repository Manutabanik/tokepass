export const SPOTIFY_ARTIST_EMBED_HEIGHT = 80

export function isSpotifyArtistId(value: unknown): value is string {
  if (typeof value !== "string") return false
  const id = value.trim()
  return /^[0-9A-Za-z]{10,32}$/.test(id)
}

export function pickSpotifyArtistId(
  items: Array<{ spotifyId?: string | null }>,
): string | null {
  for (const item of items) {
    if (isSpotifyArtistId(item.spotifyId)) return item.spotifyId.trim()
  }
  return null
}

export function spotifyArtistEmbedSrc(spotifyId: string): string | null {
  const id = spotifyId.trim()
  if (!isSpotifyArtistId(id)) return null
  return `https://open.spotify.com/embed/artist/${encodeURIComponent(id)}?utm_source=generator&theme=0&autoplay=1`
}
