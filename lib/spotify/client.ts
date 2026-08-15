import "server-only"

import { logger } from "@/lib/logger"
import {
  isSuccessfulSpotifyStatus,
  mapSpotifyArtist,
  mapSpotifyTopTrack,
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
const TOKEN_SKEW_MS = 60_000

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

export async function fetchArtistTopTrack(
  spotifyId: string,
): Promise<SpotifyTopTrack> {
  const empty: SpotifyTopTrack = { previewUrl: null, trackName: null }
  const id = spotifyId.trim()
  if (!id || !isSpotifyConfigured()) return empty

  try {
    const token = await getClientAccessToken()
    const url = new URL(`${ARTIST_TOP_TRACKS_URL}/${encodeURIComponent(id)}/top-tracks`)
    url.searchParams.set("market", "AR")

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!isSuccessfulSpotifyStatus(response.status)) {
      if (response.status === 401) tokenCache = null
      logger.error({
        context: "spotify",
        message: "top_tracks_request_failed",
        status: response.status,
      })
      return empty
    }

    const payload = (await response.json()) as { tracks?: unknown }
    return mapSpotifyTopTrack(payload.tracks)
  } catch (error) {
    logger.error({
      context: "spotify",
      message: "top_tracks_failed",
      error,
    })
    return empty
  }
}
