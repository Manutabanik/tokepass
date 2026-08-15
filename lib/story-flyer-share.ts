/** Web Share API + descarga de flyers PNG para Historias. */

export function includeStoryCaptureNode(node: unknown): boolean {
  if (!node || typeof node !== "object") return true
  const candidate = node as { closest?: unknown }
  if (typeof candidate.closest !== "function") return true
  try {
    return !(candidate as Element).closest("[data-story-actions]")
  } catch {
    return true
  }
}

import { storyImageSrc } from "@/lib/story-image"

export function canShareFiles(file: File): boolean {
  try {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.share !== "function"
    ) {
      return false
    }
    if (typeof navigator.canShare === "function") {
      return navigator.canShare({ files: [file] })
    }
    return true
  } catch {
    return false
  }
}

export function isNativeFileShareAvailable(): boolean {
  try {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "t.png", {
      type: "image/png",
    })
    return canShareFiles(file)
  } catch {
    return false
  }
}

export function downloadImageBlob(
  blob: Blob,
  filename = "historia-tokepass.png",
) {
  const url = URL.createObjectURL(blob)
  const ios = /iP(ad|hone|od)/.test(navigator.userAgent)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  if (ios) {
    anchor.target = "_blank"
  }
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), ios ? 60_000 : 1500)
}

/** @deprecated Prefer downloadImageBlob */
export function downloadBlob(blob: Blob, filename: string) {
  downloadImageBlob(blob, filename)
}

export function openInstagramStoryCamera() {
  window.setTimeout(() => {
    window.location.href = "instagram://story-camera"
  }, 500)
}

export function downloadAndOpenInstagram(
  blob: Blob,
  filename = "tokepass-historia.png",
) {
  downloadImageBlob(blob, filename)
  openInstagramStoryCamera()
}

export type ShareFlyerResult =
  | { ok: true; method: "share" | "download" }
  | { ok: false; cancelled?: boolean; error: string }

/**
 * Intenta navigator.share con el PNG; si no hay soporte o falla, descarga el archivo.
 */
export async function shareOrDownloadFlyer(input: {
  blob: Blob
  filename?: string
  title: string
  text: string
}): Promise<ShareFlyerResult> {
  const filename = input.filename ?? "historia-tokepass.png"
  const file = new File([input.blob], filename, {
    type: input.blob.type || "image/png",
  })

  if (canShareFiles(file)) {
    try {
      await navigator.share({
        files: [file],
        title: input.title,
        text: input.text,
      })
      return { ok: true, method: "share" }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { ok: false, cancelled: true, error: "cancelado" }
      }
    }
  }

  try {
    downloadImageBlob(input.blob, filename)
    return { ok: true, method: "download" }
  } catch {
    return { ok: false, error: "No se pudo guardar la imagen." }
  }
}

/** Descarga un PNG remoto (p. ej. flyer custom del organizador) y lo comparte. */
export async function shareRemoteImage(input: {
  url: string
  filename?: string
  title: string
  text: string
}): Promise<ShareFlyerResult> {
  try {
    const src = storyImageSrc(input.url) ?? input.url
    const response = await fetch(src, { cache: "no-store" })
    if (!response.ok) {
      return { ok: false, error: "No se pudo cargar la imagen." }
    }
    const blob = await response.blob()
    return shareOrDownloadFlyer({
      blob,
      filename: input.filename ?? "historia-tokepass.png",
      title: input.title,
      text: input.text,
    })
  } catch {
    return { ok: false, error: "No se pudo compartir la imagen." }
  }
}
