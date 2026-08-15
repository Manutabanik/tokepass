import "server-only"

import { logger } from "@/lib/logger"
import {
  isPlayablePreviewUrl,
  isSuccessfulSpotifyStatus,
  listSpotifyTrackCandidates,
  mapSpotifyArtist,
  mapSpotifyTopTrack,
  parseSpotifyEmbedPreview,
  type SpotifyArtistHit,
  type SpotifyArtistItem,
  type SpotifyTopTrack,
} from "@/lib/spotify/map"

export type { SpotifyArtistHit, SpotifyTopTrack }
export { isSuccessfulSpotifyStatus }

const TOKEN_URL = "https://accounts.spotify.com/api/token"
const SEARCH_URL = "https://api.spotify.com/v1/search"
const ARTIST_TOP_TRACKS_URL = "https://api.spotify.com/v1/artists"
const SEARCH_LIMIT = 8
const FETCH_TIMEOUT_MS = 8000
const EMBED_TIMEOUT_MS = 5000
const TOKEN_SKEW_MS = 60_000
const PREVIEW_MARKETS = ["AR", "US"] as const
const EMBED_PREVIEW_LIMIT = 5

type CachedToken = {
  accessToken: string
  expiresAt: number
}

let tokenCache: CachedToken | null = null

export type SpotifyCatalogResult = {
  ok: boolean
  items: SpotifyArtistHit[]
}

function spotifyCredentials(): { id: string; secret: string } | null {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim()
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim()
  if (!id || !secret) return null
  return { id, secret }
}

export function isSpotifyConfigured(): boolean {
  return spotifyCredentials() !== null
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}

async function getClientAccessToken(): Promise<string> {
  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now) {
    return tokenCache.accessToken
  }

  const credentials = spotifyCredentials()
  if (!credentials) {
    throw new Error("spotify_not_configured")
  }

  const basic = Buffer.from(`${credentials.id}:${credentials.secret}`).toString("base64")
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  })

  if (!isSuccessfulSpotifyStatus(response.status)) {
    logger.error({
      context: "spotify",
      message: "token_request_failed",
      status: response.status,
    })
    throw new Error("spotify_token_failed")
  }

  const payload = (await response.json()) as {
    access_token?: unknown
    expires_in?: unknown
  }
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : ""
  const expiresIn =
    typeof payload.expires_in === "number" ? payload.expires_in : 3600
  if (!accessToken) {
    throw new Error("spotify_token_missing")
  }

  tokenCache = {
    accessToken,
    expiresAt: now + Math.max(30, expiresIn) * 1000 - TOKEN_SKEW_MS,
  }
  return accessToken
}

export async function searchSpotifyCatalog(
  query: string,
): Promise<SpotifyCatalogResult> {
  if (!isSpotifyConfigured()) {
    return { ok: false, items: [] }
  }

  try {
    const token = await getClientAccessToken()
    const url = new URL(SEARCH_URL)
    url.searchParams.set("q", query)
    url.searchParams.set("type", "artist")
    url.searchParams.set("limit", String(SEARCH_LIMIT))

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!isSuccessfulSpotifyStatus(response.status)) {
      if (response.status === 401) tokenCache = null
      logger.error({
        context: "spotify",
        message: "search_request_failed",
        status: response.status,
      })
      return { ok: false, items: [] }
    }

    const payload = (await response.json()) as {
      artists?: { items?: unknown }
    }
    const items = Array.isArray(payload.artists?.items)
      ? payload.artists.items
      : []
    return {
      ok: true,
      items: items
        .map((item) => mapSpotifyArtist(item as SpotifyArtistItem))
        .filter((item): item is SpotifyArtistHit => Boolean(item)),
    }
  } catch (error) {
    logger.error({
      context: "spotify",
      message: "search_catalog_failed",
      error,
    })
    return { ok: false, items: [] }
  }
}

async function fetchWithTimeoutMs(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchTopTracksForMarket(
  token: string,
  artistId: string,
  market: string,
): Promise<unknown[] | null> {
  const url = new URL(
    `${ARTIST_TOP_TRACKS_URL}/${encodeURIComponent(artistId)}/top-tracks`,
  )
  url.searchParams.set("market", market)
  const response = await fetchWithTimeout(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!isSuccessfulSpotifyStatus(response.status)) {
    if (response.status === 401) tokenCache = null
    logger.error({
      context: "spotify",
      message: "top_tracks_request_failed",
      status: response.status,
      market,
    })
    return null
  }
  const payload = (await response.json()) as { tracks?: unknown }
  return Array.isArray(payload.tracks) ? payload.tracks : []
}

async function resolvePreviewFromEmbed(trackId: string): Promise<string | null> {
  const id = trackId.trim()
  if (!id) return null
  try {
    const response = await fetchWithTimeoutMs(
      `https://open.spotify.com/embed/track/${encodeURIComponent(id)}`,
      { headers: { Accept: "text/html" } },
      EMBED_TIMEOUT_MS,
    )
    if (!response.ok) return null
    return parseSpotifyEmbedPreview(await response.text())
  } catch {
    return null
  }
}

async function firstEmbedPreview(
  trackIds: string[],
): Promise<{ previewUrl: string; trackId: string } | null> {
  const unique = [...new Set(trackIds.map((id) => id.trim()).filter(Boolean))]
  const slice = unique.slice(0, EMBED_PREVIEW_LIMIT)
  const results = await Promise.all(
    slice.map(async (trackId) => {
      const previewUrl = await resolvePreviewFromEmbed(trackId)
      return previewUrl ? { previewUrl, trackId } : null
    }),
  )
  return (
    results.find((item): item is { previewUrl: string; trackId: string } =>
      Boolean(item),
    ) ?? null
  )
}

export async function fetchArtistTopTrack(
  spotifyId: string,
): Promise<SpotifyTopTrack> {
  const empty: SpotifyTopTrack = { previewUrl: null, trackName: null }
  const id = spotifyId.trim()
  if (!id || !isSpotifyConfigured()) return empty

  try {
    const token = await getClientAccessToken()
    const seenIds = new Set<string>()
    let firstName: string | null = null

    for (const market of PREVIEW_MARKETS) {
      const tracks = await fetchTopTracksForMarket(token, id, market)
      if (!tracks) continue

      const mapped = mapSpotifyTopTrack(tracks)
      if (mapped.trackName && !firstName) firstName = mapped.trackName
      if (isPlayablePreviewUrl(mapped.previewUrl)) return mapped

      const candidates = listSpotifyTrackCandidates(tracks)
      const pendingIds: string[] = []
      for (const candidate of candidates) {
        if (candidate.name && !firstName) firstName = candidate.name
        if (!candidate.id || seenIds.has(candidate.id)) continue
        seenIds.add(candidate.id)
        pendingIds.push(candidate.id)
      }

      const embedded = await firstEmbedPreview(pendingIds)
      if (embedded) {
        const trackName =
          candidates.find((item) => item.id === embedded.trackId)?.name ||
          firstName
        return { previewUrl: embedded.previewUrl, trackName }
      }
    }

    return { previewUrl: null, trackName: firstName }
  } catch (error) {
    logger.error({
      context: "spotify",
      message: "top_tracks_failed",
      error,
    })
    return empty
  }
}
