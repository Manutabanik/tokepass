"use client"

import { MapPin, Music2, Ticket } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { listMyFavoriteEventIds } from "@/app/actions/favorites"
import { FavoriteToggleButton } from "@/components/public/favorite-toggle-button"
import {
  eventCityLabel,
  eventSecondaryBadge,
  urgencyLabel,
} from "@/lib/discovery-filters"
import { deriveEventSaleState } from "@/lib/event-status"
import {
  getFavoriteIdsCache,
  setFavoriteIdsCache,
} from "@/lib/favorite-ids-cache"
import { formatCurrency, formatDiscoveryDateTime } from "@/lib/format"
import { isBoostActive } from "@/lib/services/events-service"
import { publicEventPath } from "@/lib/seo/site"
import { cn } from "@/lib/utils"

const fallbackGradients = [
  "from-zinc-200 via-zinc-100 to-zinc-300 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-700",
  "from-violet-100 via-zinc-100 to-zinc-200 dark:from-zinc-900 dark:via-violet-950 dark:to-zinc-800",
  "from-sky-100 via-zinc-100 to-zinc-200 dark:from-zinc-900 dark:via-sky-950 dark:to-zinc-800",
]

function loadFavoriteIds() {
  const cached = getFavoriteIdsCache()
  if (cached) return cached
  const promise = listMyFavoriteEventIds().catch(() => [])
  setFavoriteIdsCache(promise)
  return promise
}

function gradientForId(id: string) {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % fallbackGradients.length
  }
  return fallbackGradients[hash] ?? fallbackGradients[0]
}

function EventListCard({
  event,
  priority,
  index,
  place,
  city,
  highlighted,
  finished,
  soldOut,
  urgency,
  secondary,
}: {
  event: CatalogEvent
  priority: boolean
  index: number
  place: string
  city: string
  highlighted: boolean
  finished: boolean
  soldOut: boolean
  urgency: string | null
  secondary: string | null
}) {
  return (
    <article style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}>
      <Link
        href={publicEventPath(event)}
        className={cn(
          "group flex cursor-pointer flex-row items-center gap-4 rounded-2xl border border-border/30 bg-card/40 p-3 transition-colors hover:bg-card/80",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-secondary md:h-32 md:w-32">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              priority={priority}
              sizes="(max-width: 768px) 96px, 128px"
              className={cn(
                "object-cover transition-transform duration-500 group-hover:scale-105",
                finished && "grayscale-[50%]",
              )}
            />
          ) : (
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-br",
                gradientForId(event.id),
                finished && "grayscale-[50%]",
              )}
            />
          )}
          {highlighted ? (
            <span className="absolute top-2 left-2 rounded-md bg-primary px-2 py-0.5 text-[8px] font-black tracking-wider text-primary-foreground uppercase">
              Destacado
            </span>
          ) : null}
          {soldOut ? (
            <span className="absolute inset-x-1 bottom-1 rounded-md bg-red-600/90 px-1.5 py-0.5 text-center text-[8px] font-black tracking-wider text-white uppercase">
              Agotado
            </span>
          ) : null}
          {finished ? (
            <span className="absolute inset-x-1 bottom-1 rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-center text-[8px] font-black tracking-wider text-white uppercase">
              Finalizado
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-grow flex-col justify-center overflow-hidden">
          <span className="mb-1 truncate text-[10px] font-bold tracking-wider text-primary uppercase md:text-xs">
            {formatDiscoveryDateTime(event.date)}
          </span>
          <h3 className="mb-1 truncate text-sm leading-tight font-bold text-foreground md:text-lg">
            {event.title}
          </h3>
          <p className="mb-2 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {place}
              {city && city !== place ? ` · ${city}` : ""}
            </span>
          </p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs font-medium text-foreground/80">
              Desde{" "}
              <strong className="text-sm text-foreground">
                {event.startingPrice != null
                  ? formatCurrency(event.startingPrice)
                  : "ver precios"}
              </strong>
            </span>
            {urgency ? (
              <span className="truncate text-[10px] font-semibold text-muted-foreground">
                {urgency}
              </span>
            ) : secondary ? (
              <span className="truncate text-[10px] font-semibold text-muted-foreground">
                {secondary}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  )
}

export function EventCard({
  event,
  priority = false,
  index = 0,
  variant = "poster",
}: {
  event: CatalogEvent
  priority?: boolean
  index?: number
  variant?: "poster" | "list"
}) {
  const urgency = urgencyLabel(event)
  const secondary = eventSecondaryBadge(event)
  const city = eventCityLabel(event)
  const place = event.venueName ?? event.location
  const boosted = isBoostActive(event)
  const sponsored = Boolean(event.isSponsoredByTokepass)
  const saleState = deriveEventSaleState(event)
  const finished = saleState === "finished"
  const soldOut = saleState === "sold_out"
  const highlighted = sponsored || boosted
  const [favorited, setFavorited] = useState(false)
  const [favReady, setFavReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadFavoriteIds().then((ids) => {
      if (!cancelled) {
        setFavorited(ids.includes(event.id))
        setFavReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [event.id])

  if (variant === "list") {
    return (
      <EventListCard
        event={event}
        priority={priority}
        index={index}
        place={place}
        city={city}
        highlighted={highlighted}
        finished={finished}
        soldOut={soldOut}
        urgency={urgency}
        secondary={secondary}
      />
    )
  }

  return (
    <article
      className="relative h-full"
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      <div className="absolute right-3 top-3 z-20">
        {favReady ? (
          <FavoriteToggleButton
            key={`${event.id}-${favorited ? "1" : "0"}`}
            eventId={event.id}
            initiallyFavorited={favorited}
            className="size-11 shadow-md"
          />
        ) : (
          <span className="block size-11 rounded-full bg-black/30" />
        )}
      </div>
      <Link
        href={publicEventPath(event)}
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
              className={cn(
                "object-cover transition-transform duration-500 group-hover:scale-[1.04]",
                finished && "grayscale-[50%]",
              )}
            />
          ) : (
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-br",
                gradientForId(event.id),
                finished && "grayscale-[50%]",
              )}
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

          {soldOut ? (
            <span className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-lg">
              AGOTADO
            </span>
          ) : null}
          {finished ? (
            <span className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-800/80 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-md">
              FINALIZADO
            </span>
          ) : null}

          <div className="absolute left-3 top-3 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
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
              {finished
                ? "Ver evento"
                : soldOut
                  ? "Agotado"
                  : "Comprar entradas"}
            </span>
          </div>
        </div>
      </Link>
    </article>
  )
}
