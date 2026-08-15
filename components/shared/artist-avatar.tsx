"use client"

import { useState, type ReactNode } from "react"

import {
  artistDisplayName,
  artistGradientClass,
} from "@/lib/artist-visual"
import { getInitials } from "@/lib/format"
import { cn } from "@/lib/utils"

export function RemoteImage({
  src,
  alt = "",
  className,
  fallback,
}: {
  src?: string | null
  alt?: string
  className?: string
  fallback: ReactNode
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const url = src?.trim() || null
  if (!url || failedSrc === url) return fallback

  return (
    // External artist/event photos may live outside the Next image allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(url)}
    />
  )
}

const AVATAR_SIZE = {
  sm: "size-9 text-[11px] font-bold",
  md: "size-10 text-xs font-black",
  lg: "h-12 w-12 text-sm font-black",
  xl: "h-20 w-20 text-lg font-black",
} as const

export function ArtistAvatar({
  name,
  imageUrl,
  size = "md",
  className,
}: {
  name?: string | null
  imageUrl?: string | null
  size?: keyof typeof AVATAR_SIZE
  className?: string
}) {
  const label = artistDisplayName(name)
  const sizeClass = AVATAR_SIZE[size]
  const fallback = (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-white shadow-sm",
        sizeClass,
        artistGradientClass(label),
        className,
      )}
      aria-hidden="true"
    >
      {getInitials(label, "A")}
    </div>
  )

  return (
    <RemoteImage
      src={imageUrl}
      className={cn(
        "shrink-0 rounded-full object-cover",
        size === "xl" && "border-2 border-border",
        size === "lg" && "border border-border/50",
        sizeClass,
        className,
      )}
      fallback={fallback}
    />
  )
}
