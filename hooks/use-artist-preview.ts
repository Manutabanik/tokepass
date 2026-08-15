"use client"

import { useCallback, useSyncExternalStore } from "react"

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

function getAudio() {
  if (audio) return audio
  audio = new Audio()
  audio.preload = "none"
  audio.addEventListener("ended", () => {
    state = IDLE
    emit()
  })
  audio.addEventListener("error", () => {
    state = IDLE
    emit()
  })
  return audio
}

function setPlaying(artistId: string) {
  state = { artistId, playing: true }
  emit()
}

function failPlayback() {
  state = IDLE
  emit()
}

export function stopArtistPreview() {
  if (audio) {
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
  }
  if (state.artistId || state.playing) {
    state = IDLE
    emit()
  }
}

export function toggleArtistPreview(artistId: string, url: string) {
  const source = url.trim()
  if (!source) return

  const player = getAudio()
  if (state.artistId === artistId && state.playing) {
    player.pause()
    state = { artistId, playing: false }
    emit()
    return
  }

  if (state.artistId === artistId && !state.playing && !player.ended) {
    setPlaying(artistId)
    void player.play().catch(failPlayback)
    return
  }

  player.pause()
  player.src = source
  player.currentTime = 0
  setPlaying(artistId)
  void player.play().catch(failPlayback)
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
