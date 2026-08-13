"use client"

import { ChevronLeft, ChevronRight, Music2, Ticket } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRef } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import {
  eventCityLabel,
  eventSecondaryBadge,
  urgencyLabel,
} from "@/lib/discovery-filters"
import { formatCurrency, formatDiscoveryDateTime } from "@/lib/format"
import { isBoostActive } from "@/lib/services/events-service"
import { cn } from "@/lib/utils"

export function FeaturedCarousel({ events }: { events: CatalogEvent[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  if (events.length === 0) return null

  function scrollBy(direction: -1 | 1) {
    const node = scrollerRef.current
    if (!node) return
    const amount = Math.min(node.clientWidth * 0.85, 720)
    node.scrollBy({ left: direction * amount, behavior: "smooth" })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Destacados
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Lo que no te podés perder
          </h2>
        </div>
        {events.length > 1 ? (
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              className="grid size-10 place-items-center rounded-full border border-white/10 bg-zinc-900 text-white transition hover:bg-zinc-800"
              aria-label="Anterior"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              className="grid size-10 place-items-center rounded-full border border-white/10 bg-zinc-900 text-white transition hover:bg-zinc-800"
              aria-label="Siguiente"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0"
      >
        {events.map((event, index) => {
          const urgency = urgencyLabel(event)
          const secondary = eventSecondaryBadge(event)
          const city = eventCityLabel(event)
          const place = event.venueName ?? event.location
          const featured =
            Boolean(event.isSponsoredByTokepass) || isBoostActive(event)

          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              className={cn(
                "group relative block w-[min(88vw,34rem)] shrink-0 snap-start overflow-hidden rounded-2xl",
                "border border-white/8 bg-zinc-900",
                "transition-transform duration-300 hover:scale-[1.02]",
                "sm:w-[min(70vw,40rem)]",
              )}
            >
              <div className="relative aspect-[16/9] w-full">
                {event.imageUrl ? (
                  <Image
                    src={event.imageUrl}
                    alt={event.title}
                    fill
                    priority={index < 2}
                    sizes="(max-width: 768px) 90vw, 640px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

                <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                  {featured ? (
                    <span className="rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-md">
                      Destacado
                    </span>
                  ) : null}
                  {urgency ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                      <Ticket className="size-3" aria-hidden="true" />
                      {urgency}
                    </span>
                  ) : null}
                  {secondary ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                      <Music2 className="size-3" aria-hidden="true" />
                      {secondary}
                    </span>
                  ) : null}
                </div>

                <div className="absolute inset-x-0 bottom-0 space-y-2 p-5 sm:p-6">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-300">
                    {formatDiscoveryDateTime(event.date)}
                  </p>
                  <h3 className="line-clamp-2 text-xl font-bold text-white sm:text-2xl">
                    {event.title}
                  </h3>
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <p className="truncate text-sm text-zinc-300">
                      {place}
                      {city && city !== place ? ` · ${city}` : ""}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-zinc-950">
                      {event.startingPrice != null
                        ? `Desde ${formatCurrency(event.startingPrice)}`
                        : "Ver evento"}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
