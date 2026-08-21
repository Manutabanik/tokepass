import Image from "next/image"
import Link from "next/link"
import { Calendar, MapPin, Ticket } from "lucide-react"

import type { CatalogEvent } from "@/app/actions/public-events"
import {
  EventLineupTeaser,
  EventTypePills,
} from "@/components/discovery/event-lineup-teaser"
import { BackgroundGradient } from "@/components/ui/background-gradient"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import {
  eventCardLocationLabel,
  eventCategoryLabel,
  eventSecondaryBadge,
} from "@/lib/discovery-filters"
import { formatDiscoveryDateTime, formatTicketPrice } from "@/lib/format"
import { publicEventPath } from "@/lib/seo/site"
import { cn } from "@/lib/utils"

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
    <BackgroundGradient
      variant="featured"
      containerClassName="w-full overflow-visible bg-transparent"
    >
      <article
        className={cn(
          "relative z-10 mx-auto flex w-[min(100%-2rem,80rem)] cursor-pointer flex-col overflow-hidden rounded-3xl border border-border/30 bg-background",
          "md:flex-row md:items-stretch",
        )}
      >
        <div className="relative order-1 aspect-[4/3] w-full overflow-hidden bg-muted md:order-2 md:aspect-[4/3] md:w-1/2 lg:w-7/12">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={event.title}
              fill
              priority={priority}
              sizes="(max-width: 768px) 100vw, 58vw"
              className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              className="absolute inset-0 bg-muted"
              aria-hidden
            />
          )}
        </div>

        <div className="order-2 flex w-full flex-col justify-between bg-background p-5 md:order-1 md:w-1/2 md:p-8 lg:w-5/12 lg:p-10">
          <div className="flex flex-col gap-4 md:gap-5">
            <EventTypePills featured category={category} genre={genre} />

            <h2 className="line-clamp-2 break-words text-2xl font-black tracking-tight text-foreground transition-colors group-hover:text-primary md:text-3xl lg:text-4xl">
              <Link
                href={href}
                className="before:absolute before:inset-0 before:z-10 focus:outline-none focus-visible:before:ring-2 focus-visible:before:ring-primary/40"
              >
                {event.title}
              </Link>
            </h2>

            <EventLineupTeaser artists={event.artists} />

            <div className="flex flex-col gap-2">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-500/90">
                <Calendar className="size-4 shrink-0" aria-hidden="true" />
                <span>{formatDiscoveryDateTime(event.date)}</span>
              </p>
              <p className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                <span className="truncate">{locationLabel}</span>
              </p>
            </div>
          </div>

          <div className="relative z-0 mt-6 flex items-end justify-between gap-3 border-t border-border/20 pt-6">
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Desde
              </span>
              <span className="mt-0.5 block whitespace-nowrap text-lg font-black text-foreground sm:text-xl">
                {event.startingPrice != null
                  ? formatTicketPrice(event.startingPrice)
                  : "Ver precios"}
              </span>
            </div>

            <span className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-extrabold text-slate-950 transition-all group-hover:bg-emerald-400">
              Conseguí tus entradas
              <Ticket className="ml-2 size-4" aria-hidden="true" />
            </span>
          </div>
        </div>
      </article>
    </BackgroundGradient>
  )
}
