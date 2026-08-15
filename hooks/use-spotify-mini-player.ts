"use client"

import { useSyncExternalStore } from "react"

import { isSpotifyArtistId } from "@/lib/spotify/embed"

export type SpotifyMiniPlayerState = {
  activeArtistSpotifyId: string | null
  activeArtistId: string | null
  artistName: string | null
  resolving: boolean
}

const IDLE: SpotifyMiniPlayerState = {
  activeArtistSpotifyId: null,
  activeArtistId: null,
  artistName: null,
  resolving: false,
}

let state: SpotifyMiniPlayerState = IDLE
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return state
}

function getServerSnapshot() {
  return IDLE
}

export function closeSpotifyMiniPlayer() {
  if (
    !state.activeArtistSpotifyId &&
    !state.activeArtistId &&
    !state.resolving
  ) {
    return
  }
  state = IDLE
  emit()
}

export function setActiveSpotifyId(
  spotifyId: string | null,
  meta?: { artistId?: string | null; artistName?: string | null },
) {
  if (spotifyId == null) {
    closeSpotifyMiniPlayer()
    return
  }
  const id = spotifyId.trim()
  if (!isSpotifyArtistId(id)) return
  state = {
    activeArtistSpotifyId: id,
    activeArtistId: meta?.artistId?.trim() || state.activeArtistId,
    artistName: meta?.artistName?.trim() || state.artistName,
    resolving: false,
  }
  emit()
}

export function beginSpotifyMiniPlayerResolve(
  artistId: string,
  artistName?: string,
) {
  state = {
    activeArtistSpotifyId: null,
    activeArtistId: artistId.trim() || null,
    artistName: artistName?.trim() || null,
    resolving: true,
  }
  emit()
}

export function toggleSpotifyMiniPlayer(
  spotifyId: string,
  artistName?: string,
  artistId?: string,
) {
  const id = spotifyId.trim()
  if (!isSpotifyArtistId(id)) return

  const sameArtist =
    state.activeArtistSpotifyId === id ||
    (artistId && state.activeArtistId === artistId)
  if (sameArtist && !state.resolving) {
    closeSpotifyMiniPlayer()
    return
  }

  setActiveSpotifyId(id, { artistId, artistName })
}

export function useSpotifyMiniPlayer() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useIsSpotifyMiniPlayerActive(input: {
  id?: string | null
  spotifyId?: string | null
}) {
  const current = useSpotifyMiniPlayer()
  if (input.id && current.activeArtistId === input.id) return true
  const spotifyId = input.spotifyId?.trim() || ""
  return Boolean(spotifyId && current.activeArtistSpotifyId === spotifyId)
}
