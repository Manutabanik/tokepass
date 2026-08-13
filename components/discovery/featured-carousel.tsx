"use client"

import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Sparkles,
  Star,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useMemo, useRef, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EventCard } from "@/components/discovery/event-card"
import { eventCityLabel } from "@/lib/discovery-filters"
import {
  FEATURED_CAROUSEL_LIMIT,
  matchesFeaturedProvince,
} from "@/lib/featured-rotation"
import { formatCurrency, formatDiscoveryDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

function DestacadoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-md",
        className,
      )}
    >
      <Sparkles className="size-3.5" aria-hidden="true" />
      Destacado
    </span>
  )
}

function FeaturedSlide({
  event,
  priority,
}: {
  event: CatalogEvent
  priority?: boolean
}) {
  const city = eventCityLabel(event)
  const place = event.venueName ?? event.location

  return (
    <article
      data-featured-card
      className={cn(
        "relative shrink-0 snap-center overflow-hidden rounded-3xl",
        "h-[450px] w-[85vw]",
        "md:h-[420px] md:w-[min(100%,56rem)] md:snap-start lg:h-[460px] lg:w-[min(100%,64rem)]",
      )}
    >
      {/* Mobile: immersive flyer + gradient */}
      <div className="absolute inset-0 md:hidden">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            priority={priority}
            sizes="85vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent"
          aria-hidden
        />
        <div className="absolute left-4 top-4 z-10">
          <DestacadoBadge />
        </div>
        <div className="absolute bottom-0 left-0 flex w-full flex-col justify-end p-6">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-300">
            <Calendar className="size-3.5 shrink-0" aria-hidden />
            {formatDiscoveryDateTime(event.date)}
          </p>
          <h3 className="text-balance text-3xl font-extrabold text-white">
            {event.title}
          </h3>
          <p className="mt-2 flex items-center gap-2 text-sm text-zinc-200">
            <MapPin className="size-4 shrink-0 text-zinc-400" aria-hidden />
            <span className="min-w-0 truncate">
              {place}
              {city && city !== place ? ` · ${city}` : ""}
            </span>
          </p>
          <Link
            href={`/events/${event.id}`}
            className="mt-5 inline-flex w-fit items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-bold text-zinc-900 transition-transform active:scale-95"
          >
            Comprar entradas
          </Link>
        </div>
      </div>

      {/* Desktop: cinematic split — info solid vs flyer */}
      <div className="hidden h-full md:grid md:grid-cols-2">
        <div className="flex h-full flex-col justify-center bg-zinc-950 p-10 text-white lg:p-16">
          <DestacadoBadge className="mb-5" />
          <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
            <Calendar className="size-3.5 shrink-0" aria-hidden />
            {formatDiscoveryDateTime(event.date)}
          </p>
          <h3 className="text-balance text-3xl font-extrabold tracking-tight lg:text-4xl xl:text-5xl">
            {event.title}
          </h3>
          <p className="mt-4 flex items-center gap-2 text-base text-zinc-300">
            <MapPin className="size-4 shrink-0 text-purple-400" aria-hidden />
            <span className="min-w-0 truncate">
              {place}
              {city && city !== place ? ` · ${city}` : ""}
            </span>
          </p>
          {event.startingPrice != null ? (
            <p className="mt-3 text-sm text-zinc-400">
              Desde{" "}
              <span className="font-semibold text-white">
                {formatCurrency(event.startingPrice)}
              </span>
            </p>
          ) : null}
          <Link
            href={`/events/${event.id}`}
            className="mt-8 inline-flex w-fit items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-bold text-zinc-900 transition hover:bg-zinc-100 active:scale-95"
          >
            Comprar entradas
          </Link>
        </div>

        <div className="relative h-full min-h-[420px] lg:min-h-[460px]">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              priority={priority}
              sizes="(max-width: 1280px) 50vw, 640px"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900" />
          )}
        </div>
      </div>
    </article>
  )
}

export function FeaturedCarousel({
  pool,
  province = "todas",
}: {
  /** Pool auspiciado ya mezclado en el servidor (Fisher–Yates). */
  pool: CatalogEvent[]
  province?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [showAll, setShowAll] = useState(false)

  const filteredPool = useMemo(
    () => pool.filter((event) => matchesFeaturedProvince(event, province)),
    [pool, province],
  )

  const slides = filteredPool.slice(0, FEATURED_CAROUSEL_LIMIT)
  const totalSponsored = filteredPool.length
  const hasMore = totalSponsored > FEATURED_CAROUSEL_LIMIT

  if (slides.length === 0) return null

  function scrollByCard(direction: -1 | 1) {
    const node = scrollerRef.current
    if (!node) return
    const card = node.querySelector<HTMLElement>("[data-featured-card]")
    const amount = (card?.offsetWidth ?? node.clientWidth * 0.85) + 16
    node.scrollBy({ left: direction * amount, behavior: "smooth" })
  }

  return (
    <section className="space-y-5" aria-label="Eventos destacados">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-purple-600" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              Destacados
            </h2>
          </div>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Auspicios y boosts · rotación equitativa
          </p>
        </div>
      </div>

      <div className="relative">
        {slides.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => scrollByCard(-1)}
              className="absolute left-2 top-1/2 z-20 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-zinc-950/80 text-white shadow-lg backdrop-blur-md transition hover:bg-zinc-900 md:grid lg:-left-3"
              aria-label="Anterior destacado"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollByCard(1)}
              className="absolute right-2 top-1/2 z-20 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-zinc-950/80 text-white shadow-lg backdrop-blur-md transition hover:bg-zinc-900 md:grid lg:-right-3"
              aria-label="Siguiente destacado"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        ) : null}

        <div
          ref={scrollerRef}
          className={cn(
            "flex gap-4 overflow-x-auto scroll-smooth pb-2 md:gap-6",
            "snap-x snap-mandatory",
            "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "-mx-4 px-4 md:mx-0 md:px-0",
          )}
        >
          {slides.map((event, index) => (
            <FeaturedSlide
              key={event.id}
              event={event}
              priority={index === 0}
            />
          ))}
          <div className="w-2 shrink-0 md:w-4" aria-hidden />
        </div>
      </div>

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="text-sm font-medium text-purple-600 underline-offset-4 transition hover:underline dark:text-purple-400"
          >
            {showAll
              ? "Ocultar grilla de destacados"
              : "Ver todos los eventos destacados"}
          </button>
        </div>
      ) : null}

      {showAll && hasMore ? (
        <div
          id="featured-all-grid"
          className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-2 lg:grid-cols-3"
        >
          {filteredPool.map((event, index) => (
            <EventCard key={event.id} event={event} index={index} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
