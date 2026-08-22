"use client"

import { MapPin } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { listMyFavoriteEventIds } from "@/app/actions/favorites"
import { EventLineupTeaser } from "@/components/discovery/event-lineup-teaser"
import { FavoriteToggleButton } from "@/components/public/favorite-toggle-button"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import { eventCardLocationLabel, urgencyLabel } from "@/lib/discovery-filters"
import { deriveEventSaleState } from "@/lib/event-status"
import {
  getFavoriteIdsCache,
  setFavoriteIdsCache,
} from "@/lib/favorite-ids-cache"
import { formatDiscoveryDate, formatTicketPrice } from "@/lib/format"
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
}: {
  event: CatalogEvent
  priority: boolean
  index: number
  locationLabel: string
  highlighted: boolean
  finished: boolean
  soldOut: boolean
  urgency: string | null
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
          {highlighted ? <FlyerBadge>Imperdible</FlyerBadge> : null}
          {urgency ? <FlyerBadge pulse>{urgency}</FlyerBadge> : null}
        </div>
        {soldOut ? (
          <span className="absolute inset-x-1 bottom-1 rounded-md bg-red-600/90 px-1.5 py-0.5 text-center text-[8px] font-black tracking-wider text-white uppercase">
            Entradas agotadas
          </span>
        ) : null}
        {finished ? (
          <span className="absolute inset-x-1 bottom-1 rounded-md bg-zinc-800/80 px-1.5 py-0.5 text-center text-[8px] font-black tracking-wider text-white uppercase">
            Este evento ya pasó
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-grow flex-col justify-center">
        <span className="mb-1 truncate text-[10px] font-bold tracking-widest text-emerald-600 uppercase md:text-xs dark:text-emerald-400">
          {formatDiscoveryDate(event.date)}
        </span>
        <h3 className="mb-1 line-clamp-2 text-sm leading-tight font-black text-foreground md:text-lg">
          <Link href={publicEventPath(event)} className={overlayLinkClass}>
            {event.title}
          </Link>
        </h3>
        <EventLineupTeaser artists={event.artists} compact />
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{locationLabel}</span>
        </p>
      </div>
    </article>
  )
}

export function EventCard({
  event,
  priority = false,
  index = 0,
  variant = "poster",
  className,
}: {
  event: CatalogEvent
  priority?: boolean
  index?: number
  variant?: "poster" | "list"
  categories?: DiscoveryCategory[]
  className?: string
}) {
  const urgency = urgencyLabel(event)
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
      />
    )
  }

  const href = publicEventPath(event)
  const priceLabel =
    event.startingPrice == null
      ? "Ver precios"
      : event.startingPrice === 0
        ? "Gratis"
        : `Desde ${formatTicketPrice(event.startingPrice)}`

  return (
    <article
      className={cn(
        "group relative aspect-[4/5] w-[85vw] max-w-[320px] flex-none cursor-pointer snap-center overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-xl transition-all duration-300",
        "hover:border-emerald-500/30 hover:shadow-emerald-500/10",
        "md:aspect-[3/4] md:w-full md:max-w-none",
        highlighted && "border-emerald-500/40",
        className,
      )}
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      {event.imageUrl ? (
        <Image
          src={event.imageUrl}
          alt={event.title}
          fill
          priority={priority}
          sizes="(max-width: 768px) 85vw, (max-width: 1024px) 33vw, 25vw"
          className={cn(
            "h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105",
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

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-2/3 bg-gradient-to-t from-black via-black/90 to-transparent"
        aria-hidden="true"
      />

      <div className="absolute top-4 right-4 z-30">
        {favReady ? (
          <FavoriteToggleButton
            key={`${event.id}-${favorited ? "1" : "0"}`}
            eventId={event.id}
            initiallyFavorited={favorited}
            className="size-8 p-1.5 text-white/80 shadow-none hover:text-red-500"
          />
        ) : (
          <span className="block size-8 rounded-full bg-black/40 backdrop-blur-md" />
        )}
      </div>

      {soldOut || finished ? (
        <span className="absolute top-4 left-4 z-30 rounded-md bg-black/70 px-2 py-1 text-[9px] font-black tracking-wider text-white uppercase">
          {soldOut ? "Agotadas" : "Finalizado"}
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-wide text-emerald-400 uppercase">
            {formatDiscoveryDate(event.date)}
          </span>
          <h3 className="line-clamp-2 text-xl leading-tight font-black text-white md:text-lg">
            <Link href={href} className={overlayLinkClass}>
              {event.title}
            </Link>
          </h3>
          <p className="flex items-center gap-1 text-xs font-medium text-white/80">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{locationLabel}</span>
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <div className="flex min-w-0 flex-col">
            <span className="mb-0.5 text-[10px] font-semibold tracking-wider text-white/50 uppercase">
              Precio
            </span>
            <span className="truncate text-sm font-black text-white md:text-base">
              {priceLabel}
            </span>
          </div>
          <Link
            href={href}
            className="relative z-30 shrink-0 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-extrabold text-black shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-400 active:scale-95 md:text-sm"
          >
            {soldOut ? "Ver evento" : finished ? "Ver evento" : "Comprar ➔"}
          </Link>
        </div>
      </div>
    </article>
  )
}
