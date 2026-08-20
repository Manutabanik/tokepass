"use client"

import Image from "next/image"
import { useState, type ReactNode } from "react"

import { BRAND_MARK_SRC } from "@/components/shared/brand-logo"
import { cn } from "@/lib/utils"

const gradients = [
  "from-zinc-950 via-zinc-900 to-violet-950",
  "from-zinc-950 via-indigo-950 to-zinc-900",
  "from-zinc-950 via-fuchsia-950 to-zinc-900",
  "from-black via-zinc-900 to-sky-950",
]

const OPTIMIZED_FLYER_HOSTS = new Set([
  "i.ytimg.com",
  "i.scdn.co",
  "p.scdn.co",
  "open.spotify.com",
  "localhost",
  "127.0.0.1",
])

function gradientForId(id: string) {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % gradients.length
  }
  return gradients[hash] ?? gradients[0]
}

function shouldOptimizeFlyerSrc(src: string): boolean {
  if (!src.startsWith("http://") && !src.startsWith("https://")) return true
  try {
    const url = new URL(src)
    if (OPTIMIZED_FLYER_HOSTS.has(url.hostname)) return true
    if (url.hostname.endsWith(".supabase.co")) return true
    return url.pathname.includes("/storage/v1/object/public/")
  } catch {
    return false
  }
}

function FlyerImage({
  src,
  alt,
  priority,
  sizes,
  objectFit,
}: {
  src: string
  alt: string
  priority: boolean
  sizes: string
  objectFit: "cover" | "contain"
}) {
  const [useNative, setUseNative] = useState(() => !shouldOptimizeFlyerSrc(src))
  const imageClass =
    objectFit === "contain" ? "object-contain" : "object-cover"

  if (useNative) {
    return (
      // Native fallback: next/image rejects hosts outside remotePatterns.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={cn("size-full", imageClass)} />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={imageClass}
      onError={() => setUseNative(true)}
    />
  )
}

export function EventFlyer({
  eventId,
  title,
  imageUrl,
  className,
  children,
  priority = false,
  objectFit = "cover",
  sizes = "(max-width: 768px) 100vw, 1200px",
}: {
  eventId: string
  title: string
  imageUrl: string | null
  className?: string
  children?: ReactNode
  priority?: boolean
  objectFit?: "cover" | "contain"
  sizes?: string
}) {
  if (imageUrl) {
    return (
      <div
        className={cn(
          "relative h-full w-full overflow-hidden",
          objectFit === "contain" && "bg-zinc-950",
          className,
        )}
      >
        <FlyerImage
          src={imageUrl}
          alt={title}
          priority={priority}
          sizes={sizes}
          objectFit={objectFit}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-end overflow-hidden bg-gradient-to-br p-5 text-white",
        gradientForId(eventId),
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_45%)]" />
      <span className="absolute left-5 top-5 size-10 overflow-hidden rounded-xl bg-black ring-1 ring-white/20 shadow-lg shadow-black/40">
        <Image
          src={BRAND_MARK_SRC}
          alt=""
          width={40}
          height={40}
          className="size-full object-cover"
        />
      </span>
      <div className="relative z-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">
          TokePass
        </p>
        <p className="mt-2 line-clamp-3 text-lg font-bold leading-snug tracking-tight">
          {title}
        </p>
        {children}
      </div>
    </div>
  )
}
