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
  "from-zinc-200 via-zinc-100 to-zinc-300 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-700",
  "from-violet-100 via-zinc-100 to-zinc-200 dark:from-zinc-900 dark:via-violet-950 dark:to-zinc-800",
  "from-sky-100 via-zinc-100 to-zinc-200 dark:from-zinc-900 dark:via-sky-950 dark:to-zinc-800",
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
          "group flex h-full flex-col overflow-hidden rounded-2xl border transition-all duration-300",
          "border-zinc-200 bg-white hover:scale-[1.02] hover:border-zinc-300 hover:shadow-lg",
          "dark:border-white/8 dark:bg-zinc-900/40 dark:hover:border-white/15 dark:hover:bg-zinc-900/70 dark:hover:shadow-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40",
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

          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />

          <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
            {sponsored || boosted ? (
              <span className="inline-flex items-center rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-md">
                Destacado
              </span>
            ) : null}
            {urgency ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                <Ticket className="size-3" aria-hidden="true" />
                {urgency}
              </span>
            ) : null}
            {secondary ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                <Music2 className="size-3" aria-hidden="true" />
                {secondary}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            {formatDiscoveryDateTime(event.date)}
          </p>

          <h3 className="line-clamp-2 text-lg font-bold leading-snug text-zinc-900 dark:text-white">
            {event.title}
          </h3>

          <p className="flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <MapPin
              className="mt-0.5 size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
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
              <p className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                {event.startingPrice != null
                  ? formatCurrency(event.startingPrice)
                  : "Ver precios"}
              </p>
            </div>

            <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-950 px-3.5 py-2 text-sm font-semibold text-white transition group-hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:group-hover:bg-zinc-100">
              Comprar entradas
            </span>
          </div>
        </div>
      </Link>
    </article>
  )
}
