import Image from "next/image"
import Link from "next/link"
import { MapPin, Star } from "lucide-react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { ArtistAvatar } from "@/components/shared/artist-avatar"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import { eventCardLocationLabel } from "@/lib/discovery-filters"
import { formatDiscoveryDate, formatTicketPrice } from "@/lib/format"
import { publicEventPath } from "@/lib/seo/site"

export type FeaturedBannerCardProps = {
  event: CatalogEvent
  priority?: boolean
  categories?: DiscoveryCategory[]
}

function priceTag(event: CatalogEvent) {
  if (event.startingPrice == null) return "Ver precios"
  if (event.startingPrice === 0) return "Gratis"
  return `Desde ${formatTicketPrice(event.startingPrice)}`
}

export function FeaturedBannerCard({
  event,
  priority = false,
}: FeaturedBannerCardProps) {
  const coverUrl = event.imageUrl
  const href = publicEventPath(event)
  const locationLabel = eventCardLocationLabel(event)
  const namedArtists = event.artists.filter((artist) => artist.name.trim())
  const dateLabel = formatDiscoveryDate(event.date)

  return (
    <article className="group relative flex max-h-[60vh] w-full flex-col md:max-h-none">
      <Link
        href={href}
        className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        aria-label={`Ver ${event.title}`}
      />

      <div className="relative aspect-[3/4] max-h-[min(48vh,380px)] w-full overflow-hidden rounded-3xl bg-black md:aspect-[16/9] md:max-h-[420px]">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={event.title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 90vw, (max-width: 1024px) 85vw, 80vw"
            className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-zinc-900" aria-hidden />
        )}

        <div className="pointer-events-none absolute top-3 left-3 z-20">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-3 py-1 text-[10px] font-black tracking-wider text-black uppercase">
            <Star className="size-3 fill-current" aria-hidden="true" />
            Destacado
          </span>
        </div>

        <div className="pointer-events-none absolute right-3 bottom-3 z-20">
          <span className="rounded-xl border border-white/10 bg-black/80 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md">
            {priceTag(event)}
          </span>
        </div>
      </div>

      <div className="min-w-0 px-1 pt-3">
        <p className="text-xs font-bold tracking-wider text-emerald-400 uppercase">
          {dateLabel}
        </p>
        <h2 className="mt-0.5 line-clamp-1 text-lg font-black text-foreground">
          {event.title}
        </h2>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden="true" />
          <span className="line-clamp-1">{locationLabel}</span>
        </p>
        {namedArtists.length > 0 ? (
          <div className="my-1.5 flex -space-x-2">
            {namedArtists.slice(0, 3).map((artist) => (
              <ArtistAvatar
                key={artist.id || artist.name}
                name={artist.name}
                imageUrl={artist.imageUrl}
                size="xs"
                className="size-6 border border-black"
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}
