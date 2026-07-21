import Image from "next/image"
import Link from "next/link"

import type { CatalogEvent } from "@/app/actions/public-events"
import { formatCurrency, formatDiscoveryDate } from "@/lib/format"
import { cn } from "@/lib/utils"

const fallbackGradients = [
  "from-zinc-950 via-zinc-900 to-emerald-950",
  "from-black via-zinc-900 to-sky-950",
  "from-zinc-950 via-neutral-900 to-rose-950",
  "from-zinc-950 via-zinc-900 to-amber-950",
]

function gradientForId(id: string) {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % fallbackGradients.length
  }
  return fallbackGradients[hash] ?? fallbackGradients[0]
}

export function DiscoveryEventCard({
  event,
  priority = false,
}: {
  event: CatalogEvent
  priority?: boolean
}) {
  return (
    <Link
      href={`/events/${event.id}`}
      className={cn(
        "group relative block overflow-hidden rounded-[1.75rem]",
        "border border-zinc-800/90 bg-zinc-950",
        "shadow-[0_20px_60px_-30px_rgba(0,0,0,0.85)]",
        "transition-[border-color,transform,box-shadow] duration-300 ease-out",
        "hover:-translate-y-0.5 hover:border-zinc-700",
        "hover:shadow-[0_28px_70px_-28px_rgba(0,0,0,0.95)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
      )}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden sm:aspect-[3/4]">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 ease-in-out group-hover:scale-110"
          />
        ) : (
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-br transition-transform duration-500 ease-in-out group-hover:scale-110",
              gradientForId(event.id),
            )}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-md">
            {formatDiscoveryDate(event.date)}
          </span>
          {event.status === "draft" && (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200 backdrop-blur-md">
              Preview
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 space-y-2 p-5 sm:p-6">
          {event.organizerName && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
              {event.organizerName}
            </p>
          )}
          <h2 className="text-2xl font-black leading-tight tracking-[-0.03em] text-white sm:text-[1.7rem]">
            {event.title}
          </h2>
          <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
            <p className="line-clamp-1 text-sm text-white/60">
              {event.venueName ?? event.location}
            </p>
            <p className="shrink-0 text-sm font-bold text-white">
              {event.startingPrice != null
                ? `Desde ${formatCurrency(event.startingPrice)}`
                : "Ver entradas"}
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}
