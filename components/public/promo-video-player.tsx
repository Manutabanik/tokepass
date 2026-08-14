"use client"

import Image from "next/image"
import { useMemo, useState } from "react"

import { getEmbedUrl } from "@/lib/promo-video"
import { cn } from "@/lib/utils"

type PromoVideoPlayerProps = {
  url: string | null | undefined
  /** Banner / flyer del evento si la URL falla o no hay video. */
  fallbackImageUrl?: string | null
  title?: string
  className?: string
  /** Si true y no hay URL válida, renderiza el fallback. Default: false (null). */
  showFallbackWhenEmpty?: boolean
}

const IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"

function FallbackBanner({
  imageUrl,
  title,
  className,
}: {
  imageUrl: string
  title: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-2xl bg-muted shadow-lg",
        className,
      )}
    >
      <Image
        src={imageUrl}
        alt={title}
        fill
        className="object-cover"
        sizes="(max-width: 1024px) 100vw, 640px"
      />
    </div>
  )
}

/**
 * Reproduce YouTube / Shorts / Vimeo / MP4-WebM con autoplay muted (iOS/Android).
 * Si la URL es inválida, muestra el banner del evento sin romper la página.
 */
export function PromoVideoPlayer({
  url,
  fallbackImageUrl = null,
  title = "Spot promocional",
  className,
  showFallbackWhenEmpty = false,
}: PromoVideoPlayerProps) {
  const embed = useMemo(() => getEmbedUrl(url), [url])
  const [mediaFailed, setMediaFailed] = useState(false)

  const showFallback =
    mediaFailed ||
    !embed.type ||
    !embed.embedUrl ||
    (showFallbackWhenEmpty && !url?.trim())

  if (showFallback) {
    if (fallbackImageUrl) {
      return (
        <FallbackBanner
          imageUrl={fallbackImageUrl}
          title={title}
          className={className}
        />
      )
    }
    if (!url?.trim() && !showFallbackWhenEmpty) return null
    return (
      <div
        className={cn(
          "aspect-video w-full rounded-2xl bg-muted shadow-lg",
          className,
        )}
        aria-hidden
      />
    )
  }

  if (embed.type === "file") {
    return (
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg",
          className,
        )}
      >
        <video
          key={embed.embedUrl}
          src={embed.embedUrl!}
          autoPlay
          muted
          playsInline
          loop
          controls
          preload="metadata"
          className="h-full w-full object-cover"
          onError={() => setMediaFailed(true)}
        >
          Tu navegador no puede reproducir este video.
        </video>
      </div>
    )
  }

  return (
    <div
      className={cn(
          "relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg",
        className,
      )}
    >
      <iframe
        key={embed.embedUrl}
        src={embed.embedUrl!}
        title={title}
        allow={IFRAME_ALLOW}
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0"
        onError={() => setMediaFailed(true)}
      />
    </div>
  )
}
