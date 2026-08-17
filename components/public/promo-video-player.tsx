"use client"

import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"

import { getEmbedUrl } from "@/lib/promo-video"
import { cn } from "@/lib/utils"

type PromoVideoPlayerProps = {
  url: string | null | undefined
  fallbackImageUrl?: string | null
  title?: string
  className?: string
  showFallbackWhenEmpty?: boolean
  /** When false, native video pauses and embeds unmount so playback stops. */
  active?: boolean
  /** Do not mount iframe/video until `active` becomes true at least once. */
  deferUntilActive?: boolean
  /** Fill the parent instead of reserving aspect-video. */
  fill?: boolean
  /** Hero gallery: standard YouTube/Vimeo embed, tap to play, no autoplay. */
  gallery?: boolean
}

const FRAME_CLASS =
  "w-full aspect-video overflow-hidden rounded-xl bg-muted shadow-sm"

function Poster({
  src,
  title,
  className,
}: {
  src?: string | null
  title: string
  className?: string
}) {
  if (!src) {
    return <div className={className} aria-hidden />
  }
  return (
    <div className={cn("relative", className)}>
      <Image
        src={src}
        alt={title}
        fill
        className="object-cover"
        sizes="(max-width: 1024px) 100vw, 640px"
      />
    </div>
  )
}

export function PromoVideoPlayer({
  url,
  fallbackImageUrl = null,
  title = "Spot promocional",
  className,
  showFallbackWhenEmpty = false,
  active = true,
  deferUntilActive = false,
  fill = false,
  gallery = false,
}: PromoVideoPlayerProps) {
  const embed = useMemo(
    () => getEmbedUrl(url, { gallery }),
    [gallery, url],
  )
  const canPlay = Boolean(embed.type && embed.embedUrl)
  const [armed, setArmed] = useState(!deferUntilActive || active)
  if (active && !armed) setArmed(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameClass = cn(
    fill || gallery
      ? "relative h-full w-full overflow-hidden bg-black"
      : FRAME_CLASS,
    className,
  )

  useEffect(() => {
    const node = videoRef.current
    if (!node) return
    if (active) {
      void node.play().catch(() => undefined)
      return
    }
    node.pause()
  }, [active, armed])

  if (!canPlay) {
    if (fallbackImageUrl && showFallbackWhenEmpty) {
      return (
        <Poster src={fallbackImageUrl} title={title} className={frameClass} />
      )
    }
    if (!url?.trim() && !showFallbackWhenEmpty) return null
    return <div className={frameClass} aria-hidden />
  }

  if (!armed || (embed.type !== "file" && !active)) {
    return (
      <Poster
        src={fallbackImageUrl}
        title={title}
        className={frameClass}
      />
    )
  }

  if (embed.type === "file") {
    return (
      <div className={frameClass}>
        <video
          ref={videoRef}
          key={embed.embedUrl}
          src={embed.embedUrl ?? undefined}
          playsInline
          controls
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div className={frameClass}>
      <iframe
        key={embed.embedUrl}
        src={embed.embedUrl ?? undefined}
        title={title}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="h-full w-full border-0"
      />
    </div>
  )
}
