"use client"

import { useCallback, useSyncExternalStore } from "react"
import { toast } from "sonner"

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

export async function toggleArtistPreview(
  artistId: string,
  url: string,
  artistName?: string,
) {
  const source = url.trim()
  if (!isPlayablePreviewUrl(source)) {
    toast.error("Audio no disponible", {
      description: `No hay una vista previa disponible para ${artistName?.trim() || "este artista"}`,
    })
    return
  }

  if (state.artistId === artistId && state.playing && audio) {
    audio.pause()
    state = IDLE
    emit()
    return
  }

  if (audio) {
    releaseAudio()
  }

  const next = new Audio(source)
  next.preload = "auto"
  next.setAttribute("playsinline", "true")
  next.setAttribute("webkit-playsinline", "true")

  const onDone = () => {
    if (audio !== next) return
    releaseAudio()
    state = IDLE
    emit()
  }

  next.addEventListener("ended", onDone)
  next.addEventListener("error", () => {
    onDone()
    toast.error("Error de reproducción", {
      description: "No se pudo reproducir la vista previa de este artista.",
    })
  })

  audio = next
  state = { artistId, playing: true }
  emit()

  try {
    await next.play()
  } catch (error) {
    console.error("Error al reproducir audio:", error)
    if (audio !== next) return
    onDone()
    toast.error("Error de reproducción", {
      description: "No se pudo reproducir la vista previa de este artista.",
    })
  }
}

export function useArtistPreview(artistId: string) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const playing = current.playing && current.artistId === artistId

  const toggle = useCallback(
    async (url: string, artistName?: string) => {
      await toggleArtistPreview(artistId, url, artistName)
    },
    [artistId],
  )

  return { playing, toggle }
}
