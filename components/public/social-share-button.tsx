"use client"

import { Loader2, Share2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

type Props = {
  eventTitle: string
  eventImageUrl?: string | null
  /** Flyer 9:16 del organizador; si existe, el OG no agrega textos/overlays. */
  customStoryUrl?: string | null
  className?: string
}

function buildOgUrl(input: {
  title: string
  imageUrl?: string | null
  customStoryUrl?: string | null
}): string {
  const params = new URLSearchParams()
  params.set("title", input.title)
  if (input.customStoryUrl?.trim()) {
    params.set("customStoryUrl", input.customStoryUrl.trim())
  } else if (input.imageUrl?.trim()) {
    params.set("image", input.imageUrl.trim())
  }
  return `/api/og/share?${params.toString()}`
}

function canShareFiles(file: File): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function SocialShareButton({
  eventTitle,
  eventImageUrl,
  customStoryUrl,
  className,
}: Props) {
  const [loading, setLoading] = useState(false)

  async function handleShare() {
    if (loading) return
    setLoading(true)

    try {
      const response = await fetch(
        buildOgUrl({
          title: eventTitle,
          imageUrl: eventImageUrl,
          customStoryUrl,
        }),
        {
          method: "GET",
          cache: "no-store",
        },
      )

      if (!response.ok) {
        throw new Error("No se pudo generar la imagen.")
      }

      const blob = await response.blob()
      const file = new File([blob], "mi-entrada-evento.png", {
        type: blob.type || "image/png",
      })

      const shareText = `Ya tengo mi entrada para ${eventTitle} en Tokepass`

      if (canShareFiles(file)) {
        try {
          await navigator.share({
            files: [file],
            title: "Mi entrada Tokepass",
            text: shareText,
          })
          return
        } catch (error) {
          // User cancelled share sheet — not an error path.
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
        }
      }

      downloadBlob(blob, "mi-entrada-evento.png")
      toast.success("Imagen guardada. ¡Subila a tus historias!")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo compartir la entrada.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      disabled={loading}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 transition",
        "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500",
        "hover:from-violet-500 hover:via-fuchsia-500 hover:to-pink-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950",
        "disabled:cursor-not-allowed disabled:opacity-70",
        "sm:w-auto",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
      ) : (
        <Share2 className="mr-2 size-5 shrink-0" aria-hidden />
      )}
      {loading ? "Generando imagen…" : "Compartir en IG Stories"}
    </button>
  )
}
