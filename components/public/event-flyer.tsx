import Image from "next/image"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const gradients = [
  "from-zinc-950 via-zinc-900 to-violet-950",
  "from-zinc-950 via-indigo-950 to-zinc-900",
  "from-zinc-950 via-fuchsia-950 to-zinc-900",
  "from-black via-zinc-900 to-sky-950",
]

function gradientForId(id: string) {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % gradients.length
  }
  return gradients[hash] ?? gradients[0]
}

export function EventFlyer({
  eventId,
  title,
  imageUrl,
  className,
  children,
  priority = false,
}: {
  eventId: string
  title: string
  imageUrl: string | null
  className?: string
  children?: ReactNode
  priority?: boolean
}) {
  if (imageUrl) {
    return (
      <div className={cn("relative h-full w-full overflow-hidden", className)}>
        <Image
          src={imageUrl}
          alt={title}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover"
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
      <div className="absolute left-5 top-5 grid size-10 place-items-center rounded-xl bg-white/10 text-sm font-black tracking-tight ring-1 ring-white/15 backdrop-blur">
        T
      </div>
      <div className="relative z-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">
          Tokepass
        </p>
        <p className="mt-2 line-clamp-3 text-lg font-bold leading-snug tracking-tight">
          {title}
        </p>
        {children}
      </div>
    </div>
  )
}
