"use client"

import { useCallback, useSyncExternalStore } from "react"

import { isPlayablePreviewUrl } from "@/lib/spotify/map"

type PreviewState = {
  artistId: string | null
  playing: boolean
}

const IDLE: PreviewState = { artistId: null, playing: false }

let audio: HTMLAudioElement | null = null
let state: PreviewState = IDLE
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

function silence(player: HTMLAudioElement) {
  player.pause()
  player.removeAttribute("src")
  try {
    player.load()
  } catch {
    /* Safari can throw if the element is already tearing down. */
  }
}

function releaseAudio() {
  if (!audio) return
  silence(audio)
  audio = null
}

export function stopArtistPreview() {
  releaseAudio()
  if (state.artistId || state.playing) {
    state = IDLE
    emit()
  }
}

export function toggleArtistPreview(artistId: string, url: string) {
  const source = url.trim()
  if (!isPlayablePreviewUrl(source)) return

  if (state.artistId === artistId && state.playing && audio) {
    audio.pause()
    state = { artistId, playing: false }
    emit()
    return
  }

  if (audio) {
    silence(audio)
    audio = null
  }

  const next = new Audio(source)
  next.preload = "auto"
  next.setAttribute("playsinline", "true")
  next.setAttribute("webkit-playsinline", "true")
  const onDone = () => {
    if (audio !== next) return
    audio = null
    state = IDLE
    emit()
  }
  next.addEventListener("ended", onDone)
  next.addEventListener("error", onDone)
  audio = next
  state = { artistId, playing: true }
  emit()
  void next.play().catch(() => {
    if (audio !== next) return
    onDone()
  })
}

export function useArtistPreview(artistId: string) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const playing = current.playing && current.artistId === artistId

  const toggle = useCallback(
    (url: string) => {
      toggleArtistPreview(artistId, url)
    },
    [artistId],
  )

  return { playing, toggle }
}
