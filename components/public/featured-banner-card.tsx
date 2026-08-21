import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Calendar, MapPin, Star } from "lucide-react"

import type { CatalogEvent } from "@/app/actions/public-events"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import {
  eventCardLocationLabel,
  eventCategoryLabel,
} from "@/lib/discovery-filters"
import { formatDiscoveryDateTime } from "@/lib/format"
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
  const artistLine = event.artists
    .map((artist) => artist.name.trim())
    .filter(Boolean)
    .join(" • ")

  return (
    <article className="group relative h-[400px] w-full overflow-hidden rounded-3xl border border-white/10 shadow-2xl md:h-[480px]">
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={event.title}
          fill
          priority={priority}
          sizes="(max-width: 768px) 90vw, (max-width: 1024px) 85vw, 80vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-zinc-900" aria-hidden />
      )}

      <div
        className="absolute inset-0 z-10 bg-gradient-to-t from-black/95 via-black/40 to-transparent"
        aria-hidden
      />

      <Link
        href={href}
        className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-inset"
        aria-label={`Ver ${event.title}`}
      />

      <div className="pointer-events-none absolute top-6 left-6 z-20 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black tracking-wider text-black uppercase shadow-lg">
          <Star className="size-3 fill-current" aria-hidden="true" />
          Destacado
        </span>
        {category ? (
          <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md">
            {category}
          </span>
        ) : null}
      </div>

      <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 flex flex-col justify-between gap-6 p-6 md:flex-row md:items-end md:p-10">
        <div className="max-w-2xl space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-emerald-400">
            <Calendar className="size-4 shrink-0" aria-hidden="true" />
            <span>{formatDiscoveryDateTime(event.date)}</span>
            <span aria-hidden="true">•</span>
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{locationLabel}</span>
          </div>

          <h2 className="line-clamp-2 text-3xl leading-tight font-black tracking-tight text-white drop-shadow-md md:text-5xl">
            {event.title}
          </h2>

          {artistLine ? (
            <p className="line-clamp-1 text-sm font-medium text-white/70 md:text-base">
              {artistLine}
            </p>
          ) : null}
        </div>

        <Link
          href={href}
          className="pointer-events-auto inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-8 py-4 font-extrabold text-black shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-95"
        >
          <span>Comprar Entradas</span>
          <ArrowRight className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
