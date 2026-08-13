"use client"

import { MapPin, Music2, Ticket } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

import type { CatalogEvent } from "@/app/actions/public-events"
import {
  eventCityLabel,
  eventSecondaryBadge,
  urgencyLabel,
} from "@/lib/discovery-filters"
import { formatCurrency, formatDiscoveryDateTime } from "@/lib/format"
import { isBoostActive } from "@/lib/services/events-service"
import { cn } from "@/lib/utils"

const fallbackGradients = [
  "from-zinc-900 via-zinc-800 to-zinc-700",
  "from-zinc-900 via-violet-950 to-zinc-800",
  "from-zinc-900 via-sky-950 to-zinc-800",
]

function gradientForId(id: string) {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % fallbackGradients.length
  }
  return fallbackGradients[hash] ?? fallbackGradients[0]
}

export function EventCard({
  event,
  priority = false,
  index = 0,
}: {
  event: CatalogEvent
  priority?: boolean
  index?: number
}) {
  const urgency = urgencyLabel(event)
  const secondary = eventSecondaryBadge(event)
  const city = eventCityLabel(event)
  const place = event.venueName ?? event.location
  const boosted = isBoostActive(event)
  const sponsored = Boolean(event.isSponsoredByTokepass)

  return (
    <article
      className="h-full"
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      <Link
        href={`/events/${event.id}`}
        className={cn(
          "group flex h-full flex-col overflow-hidden rounded-2xl",
          "border border-white/8 bg-zinc-900/40",
          "transition-all duration-300 hover:scale-[1.02] hover:border-white/15",
          "hover:bg-zinc-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        )}
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              priority={priority}
              sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-br",
                gradientForId(event.id),
              )}
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent" />

          <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
            {sponsored || boosted ? (
              <span className="inline-flex items-center rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-md">
                Destacado
              </span>
            ) : null}
            {urgency ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                <Ticket className="size-3" aria-hidden="true" />
                {urgency}
              </span>
            ) : null}
            {secondary ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                <Music2 className="size-3" aria-hidden="true" />
                {secondary}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">
            {formatDiscoveryDateTime(event.date)}
          </p>

          <h3 className="line-clamp-2 text-lg font-bold leading-snug text-white">
            {event.title}
          </h3>

          <p className="flex items-start gap-1.5 text-sm text-zinc-400">
            <MapPin
              className="mt-0.5 size-3.5 shrink-0 text-zinc-500"
              aria-hidden="true"
            />
            <span className="min-w-0 truncate">
              {place}
              {city && city !== place ? ` · ${city}` : ""}
            </span>
          </p>

          <div className="mt-auto flex items-center justify-between gap-3 pt-1">
            <div className="min-w-0">
              <p className="text-[11px] text-zinc-500">Desde</p>
              <p className="truncate text-base font-semibold text-white">
                {event.startingPrice != null
                  ? formatCurrency(event.startingPrice)
                  : "Ver precios"}
              </p>
            </div>

            <span className="inline-flex shrink-0 items-center rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-zinc-950 transition group-hover:bg-zinc-100">
              Comprar entradas
            </span>
          </div>
        </div>
      </Link>
    </article>
  )
}
