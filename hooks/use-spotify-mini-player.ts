"use client"

import { useSyncExternalStore } from "react"

import { isSpotifyArtistId } from "@/lib/spotify/embed"

export type SpotifyMiniPlayerState = {
  activeArtistSpotifyId: string | null
  artistName: string | null
}

const IDLE: SpotifyMiniPlayerState = {
  activeArtistSpotifyId: null,
  artistName: null,
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
  if (!state.activeArtistSpotifyId && !state.artistName) return
  state = IDLE
  emit()
}

export function toggleSpotifyMiniPlayer(spotifyId: string, artistName?: string) {
  const id = spotifyId.trim()
  if (!isSpotifyArtistId(id)) return

  if (state.activeArtistSpotifyId === id) {
    closeSpotifyMiniPlayer()
    return
  }

  state = {
    activeArtistSpotifyId: id,
    artistName: artistName?.trim() || null,
  }
  emit()
}

export function useSpotifyMiniPlayer() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useIsSpotifyMiniPlayerActive(spotifyId: string | null | undefined) {
  const current = useSpotifyMiniPlayer()
  const id = spotifyId?.trim() || ""
  return Boolean(id && current.activeArtistSpotifyId === id)
}
