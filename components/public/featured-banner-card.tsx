import Image from "next/image"
import Link from "next/link"
import { Calendar, MapPin, Ticket } from "lucide-react"

import type { CatalogEvent } from "@/app/actions/public-events"
import {
  EventLineupTeaser,
  EventTypePills,
} from "@/components/discovery/event-lineup-teaser"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import {
  eventCardLocationLabel,
  eventCategoryLabel,
  eventSecondaryBadge,
} from "@/lib/discovery-filters"
import { formatDiscoveryDateTime, formatTicketPrice } from "@/lib/format"
import { publicEventPath } from "@/lib/seo/site"

export type FeaturedBannerCardProps = {
  event: CatalogEvent
  priority?: boolean
  categories?: DiscoveryCategory[]
}

export function FeaturedBannerCard({
  event,
  priority = false,
  categories,
}: FeaturedBannerCardProps) {
  const coverUrl = event.imageUrl
  const href = publicEventPath(event)
  const locationLabel = eventCardLocationLabel(event)
  const category = eventCategoryLabel(event, categories)
  const genre = eventSecondaryBadge(event)

  return (
    <article className="group relative flex w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-card/40 shadow-[0_0_50px_-12px_rgba(16,185,129,0.15)] backdrop-blur-md md:flex-row">
      <div className="relative min-h-[250px] w-full shrink-0 overflow-hidden bg-black md:order-2 md:min-h-full md:w-[50%] lg:w-[55%]">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={event.title}
            fill
            priority={priority}
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" aria-hidden />
        )}
        <div className="absolute inset-y-0 left-0 z-10 hidden w-24 bg-gradient-to-r from-card/40 to-transparent md:block" />
      </div>

      <div className="z-10 flex min-h-0 w-full min-w-0 flex-1 flex-col justify-center p-6 sm:p-8 md:order-1 lg:p-10">
        <div className="min-w-0 space-y-3">
          <EventTypePills featured category={category} genre={genre} />

          <h2 className="line-clamp-2 break-words text-2xl font-black tracking-tight text-foreground transition-colors group-hover:text-primary lg:text-3xl">
            <Link
              href={href}
              className="before:absolute before:inset-0 before:z-10 focus:outline-none focus-visible:before:ring-2 focus-visible:before:ring-primary/40"
            >
              {event.title}
            </Link>
          </h2>

          <EventLineupTeaser artists={event.artists} />

          <div className="space-y-2">
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-emerald-500/90">
              <Calendar className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">
                {formatDiscoveryDateTime(event.date)}
              </span>
            </p>
            <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <MapPin
                className="size-4 shrink-0 text-emerald-500"
                aria-hidden="true"
              />
              <span className="min-w-0 truncate">{locationLabel}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex w-full min-w-0 shrink-0 flex-row items-center justify-between gap-3 border-t border-border/20 pt-4">
          <div className="min-w-0">
            <span className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              {event.startingPrice === 0 ? "Entrada" : "Entradas desde"}
            </span>
            <p className="truncate text-2xl font-black text-foreground">
              {event.startingPrice == null
                ? "Ver precios"
                : event.startingPrice === 0
                  ? "gratuita"
                  : formatTicketPrice(event.startingPrice)}
            </p>
          </div>

          <span className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-emerald-500 px-3 py-2.5 text-center text-sm font-bold text-slate-950 transition-all group-hover:bg-emerald-400 sm:px-4 sm:py-3 sm:whitespace-nowrap">
            Ver entradas
            <Ticket className="size-5 shrink-0" aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  )
}
