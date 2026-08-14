"use client"

import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Sparkles,
  Star,
  Ticket,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useMemo, useRef, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EventCard } from "@/components/discovery/event-card"
import { eventCityLabel } from "@/lib/discovery-filters"
import { publicEventPath } from "@/lib/seo/site"
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
        "inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md",
        className,
      )}
    >
      <Sparkles className="size-3.5" aria-hidden="true" />
      Destacado
    </span>
  )
}

function featuredMicrocopy(event: CatalogEvent): string {
  if (event.ticketsLeft != null && event.ticketsLeft > 0 && event.ticketsLeft <= 15) {
    return `Últimas ${event.ticketsLeft} entradas disponibles`
  }
  if (event.soldRatio != null && event.soldRatio >= 0.65) {
    return "Alta demanda · conseguí la tuya ahora"
  }
  if (event.startingPrice === 0) {
    return "Entrada gratuita · cupos limitados"
  }
  if (event.startingPrice != null) {
    return `Desde ${formatCurrency(event.startingPrice)}`
  }
  return "Entrada digital lista en minutos"
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
        "group relative shrink-0 snap-center overflow-hidden rounded-3xl",
        "h-[min(72vh,450px)] min-h-[450px] w-[85vw]",
        "md:h-[500px] md:min-h-[500px] md:w-[min(100%,56rem)] md:snap-start",
        "lg:w-[min(100%,64rem)]",
      )}
    >
      {event.imageUrl ? (
        <Image
          src={event.imageUrl}
          alt=""
          fill
          priority={priority}
          sizes="(max-width: 768px) 85vw, 64rem"
          className="object-cover transition-transform duration-700 ease-in-out group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-zinc-950 to-violet-950 transition-transform duration-700 ease-in-out group-hover:scale-105"
          aria-hidden
        />
      )}

      <div
        className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent/20 md:bg-gradient-to-r md:from-black/95 md:via-black/70 md:to-transparent"
        aria-hidden
      />

      <div className="relative z-10 flex h-full w-full flex-col justify-end p-6 md:w-2/3 md:justify-center md:p-12">
        <DestacadoBadge className="mb-4" />
        <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-300 drop-shadow">
          <Calendar className="size-3.5 shrink-0 opacity-80" aria-hidden />
          {formatDiscoveryDateTime(event.date)}
        </p>
        <h3 className="text-balance text-4xl font-black tracking-tight text-white drop-shadow-lg md:text-5xl lg:text-6xl">
          {event.title}
        </h3>
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-300 md:text-base">
          <MapPin className="size-4 shrink-0 opacity-80" aria-hidden />
          <span className="min-w-0 truncate">
            {place}
            {city && city !== place ? ` · ${city}` : ""}
          </span>
        </p>

        <Link
          href={publicEventPath(event)}
          className="mt-8 inline-flex w-fit flex-col items-center"
        >
          <span className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-3.5 text-lg font-bold text-black shadow-[0_0_20px_rgba(16,185,129,0.45)] transition-all duration-300 hover:scale-105 hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(16,185,129,0.65)] active:scale-[0.98]">
            <Ticket className="size-5" aria-hidden />
            Conseguí tus entradas
          </span>
          <span className="mt-2 text-[11px] font-medium tracking-wide text-white/55">
            {featuredMicrocopy(event)}
          </span>
        </Link>
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
