import Image from "next/image"
import Link from "next/link"
import { Calendar, MapPin, Sparkles } from "lucide-react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { eventCityLabel } from "@/lib/discovery-filters"
import { formatDiscoveryDateTime } from "@/lib/format"
import { publicEventPath } from "@/lib/seo/site"
import { cn } from "@/lib/utils"

export type FeaturedBannerCardProps = {
  event: CatalogEvent
  priority?: boolean
}

export function FeaturedBannerCard({
  event,
  priority = false,
}: FeaturedBannerCardProps) {
  const coverUrl = event.imageUrl
  const place = event.venueName ?? event.location
  const city = eventCityLabel(event)

  return (
    <Link
      href={publicEventPath(event)}
      className={cn(
        "group relative block aspect-[16/9] w-full overflow-hidden rounded-3xl border border-border/40 shadow-2xl sm:aspect-[21/9] lg:aspect-[16/6]",
      )}
      aria-label={`Ver ${event.title}`}
    >
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={event.title}
          fill
          priority={priority}
          sizes="(max-width: 640px) 92vw, (max-width: 1024px) 86vw, 1120px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-violet-950 via-zinc-900 to-zinc-800 transition-transform duration-500 group-hover:scale-105"
          aria-hidden
        />
      )}

      <span
        className="absolute top-4 right-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-violet-600/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur-md"
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        Destacado
      </span>

      <div
        className="absolute inset-x-0 bottom-0 z-10 flex h-2/5 flex-col justify-end space-y-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-6 md:p-8"
      >
        <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-md sm:text-4xl">
          {event.title}
        </h2>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1">
          <p className="flex items-center gap-2 text-xs text-zinc-200 sm:text-sm">
            <Calendar className="size-3.5 shrink-0 opacity-80" aria-hidden="true" />
            <span>{formatDiscoveryDateTime(event.date)}</span>
          </p>
          <p className="flex min-w-0 items-center gap-2 text-xs text-zinc-200 sm:text-sm">
            <MapPin className="size-3.5 shrink-0 opacity-80" aria-hidden="true" />
            <span className="truncate">
              {place}
              {city && city !== place ? ` · ${city}` : ""}
            </span>
          </p>
        </div>
      </div>
    </Link>
  )
}
