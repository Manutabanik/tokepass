"use client"

import { MapPin } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { listMyFavoriteEventIds } from "@/app/actions/favorites"
import {
  EventLineupTeaser,
  EventTypePills,
} from "@/components/discovery/event-lineup-teaser"
import { FavoriteToggleButton } from "@/components/public/favorite-toggle-button"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import {
  eventCardLocationLabel,
  eventCategoryLabel,
  eventSecondaryBadge,
  urgencyLabel,
} from "@/lib/discovery-filters"
import { deriveEventSaleState } from "@/lib/event-status"
import {
  getFavoriteIdsCache,
  setFavoriteIdsCache,
} from "@/lib/favorite-ids-cache"
import { formatDiscoveryDateTime, formatTicketPrice } from "@/lib/format"
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

const overlayLinkClass =
  "before:absolute before:inset-0 before:z-10 focus:outline-none focus-visible:before:ring-2 focus-visible:before:ring-primary/40"

function FlyerBadge({
  children,
  pulse = false,
}: {
  children: ReactNode
  pulse?: boolean
}) {
  return (
    <span className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] font-bold tracking-wider text-white uppercase shadow-lg backdrop-blur-md drop-shadow-md">
      {pulse ? (
        <span
          className="size-2 rounded-full bg-red-500 motion-safe:animate-pulse"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  )
}

function EventListCard({
  event,
  priority,
  index,
  locationLabel,
  highlighted,
  finished,
  soldOut,
  urgency,
  category,
  genre,
}: {
  event: CatalogEvent
  priority: boolean
  index: number
  locationLabel: string
  highlighted: boolean
  finished: boolean
  soldOut: boolean
  urgency: string | null
  category: string | null
  genre: string | null
}) {
  return (
    <article
      className={cn(
        "group relative flex h-full w-full cursor-pointer flex-row items-center gap-4 rounded-2xl bg-card p-3 transition-all duration-300 hover:shadow-lg",
        highlighted
          ? "border-2 border-emerald-500/40 dark:border-emerald-500/50"
          : "border border-border/60 hover:border-border",
      )}
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-900 md:w-32">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 96px, 128px"
            className={cn(
              "h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105",
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
        <div className="pointer-events-none absolute top-2 left-2 z-20 flex max-w-[calc(100%-0.5rem)] flex-col gap-1">
          {highlighted ? <FlyerBadge>Destacado</FlyerBadge> : null}
          {urgency ? <FlyerBadge pulse>{urgency}</FlyerBadge> : null}
        </div>
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
      <div className="flex min-w-0 flex-grow flex-col justify-center">
        <span className="mb-1 truncate text-[10px] font-bold tracking-widest text-emerald-600 uppercase md:text-xs dark:text-emerald-400">
          {formatDiscoveryDateTime(event.date)}
        </span>
        <EventTypePills
          category={category}
          genre={genre}
          className="mb-1 gap-1.5"
        />
        <h3 className="mb-1 line-clamp-2 text-sm leading-tight font-black text-foreground md:text-lg">
          <Link href={publicEventPath(event)} className={overlayLinkClass}>
            {event.title}
          </Link>
        </h3>
        <EventLineupTeaser artists={event.artists} compact />
        <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{locationLabel}</span>
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Desde
            </span>
            <span className="whitespace-nowrap text-sm font-black text-foreground md:text-base">
              {event.startingPrice != null
                ? formatTicketPrice(event.startingPrice)
                : "Ver precios"}
            </span>
          </div>
          <span className="relative z-0 inline-flex h-12 min-h-[48px] shrink-0 items-center rounded-xl bg-emerald-500 px-5 text-sm font-black text-slate-950 shadow-lg transition-colors duration-300 group-hover:bg-emerald-400">
            {finished ? "Ver evento" : soldOut ? "Agotado" : "Adquirir"}
          </span>
        </div>
      </div>
    </article>
  )
}

export function EventCard({
  event,
  priority = false,
  index = 0,
  variant = "poster",
  categories,
}: {
  event: CatalogEvent
  priority?: boolean
  index?: number
  variant?: "poster" | "list"
  categories?: DiscoveryCategory[]
}) {
  const urgency = urgencyLabel(event)
  const secondary = eventSecondaryBadge(event)
  const category = eventCategoryLabel(event, categories)
  const locationLabel = eventCardLocationLabel(event)
  const boosted = isBoostActive(event)
  const sponsored = Boolean(event.isSponsoredByTokePass)
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
        locationLabel={locationLabel}
        highlighted={highlighted}
        finished={finished}
        soldOut={soldOut}
        urgency={urgency}
        category={category}
        genre={secondary}
      />
    )
  }

  return (
    <article
      className={cn(
        "group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl bg-card transition-all duration-300 hover:shadow-lg",
        highlighted
          ? "border-2 border-emerald-500/40 dark:border-emerald-500/50"
          : "border border-border/60 hover:border-border",
      )}
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      <div className="absolute top-3 right-3 z-20 pointer-events-auto">
        {favReady ? (
          <FavoriteToggleButton
            key={`${event.id}-${favorited ? "1" : "0"}`}
            eventId={event.id}
            initiallyFavorited={favorited}
            className="relative z-20 size-11 shadow-md"
          />
        ) : (
          <span className="block size-11 rounded-full bg-black/30" />
        )}
      </div>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted md:aspect-video">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            priority={priority}
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
            className={cn(
              "h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105",
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

        {soldOut ? (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-lg">
            AGOTADO
          </span>
        ) : null}
        {finished ? (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-800/80 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-md">
            FINALIZADO
          </span>
        ) : null}

        <div className="pointer-events-none absolute top-3 left-3 z-20 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
          {sponsored || boosted ? <FlyerBadge>Destacado</FlyerBadge> : null}
          {urgency ? <FlyerBadge pulse>{urgency}</FlyerBadge> : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
        <EventTypePills category={category} genre={secondary} className="gap-1.5" />

        <p className="truncate text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          {formatDiscoveryDateTime(event.date)}
        </p>

        <h3 className="line-clamp-2 text-xl font-black leading-tight text-foreground drop-shadow-sm dark:drop-shadow-lg">
          <Link href={publicEventPath(event)} className={overlayLinkClass}>
            {event.title}
          </Link>
        </h3>

        <EventLineupTeaser artists={event.artists} compact />

        <p className="flex items-start gap-1.5 text-sm font-medium text-muted-foreground">
          <MapPin
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="min-w-0 truncate">{locationLabel}</span>
        </p>
      </div>

      <div className="relative z-0 mt-auto flex items-center justify-between gap-2 border-t border-black/5 bg-white/60 p-4 pt-3 backdrop-blur-xl dark:border-white/10 dark:bg-black/60">
        <div className="flex min-w-0 flex-col">
          <span className="text-[10px] font-bold uppercase leading-none tracking-wider text-muted-foreground">
            Desde
          </span>
          <span className="mt-0.5 whitespace-nowrap text-xl font-black text-foreground drop-shadow-sm">
            {event.startingPrice != null
              ? formatTicketPrice(event.startingPrice)
              : "Ver precios"}
          </span>
        </div>

        <span className="relative z-0 inline-flex h-12 min-h-[48px] shrink-0 items-center rounded-xl bg-emerald-500 px-5 text-sm font-black text-slate-950 shadow-lg transition-colors duration-300 group-hover:bg-emerald-400">
          {finished ? "Ver evento" : soldOut ? "Agotado" : "Adquirir"}
        </span>
      </div>
    </article>
  )
}
