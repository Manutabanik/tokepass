import Image from "next/image"
import Link from "next/link"
import { ArrowRight, MapPin, Star } from "lucide-react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { ArtistAvatar } from "@/components/shared/artist-avatar"
import { Button } from "@/components/ui/button"
import {
  findCategory,
  type DiscoveryCategory,
} from "@/lib/discovery-categories"
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
  categories,
}: FeaturedBannerCardProps) {
  const coverUrl = event.imageUrl
  const href = publicEventPath(event)
  const locationLabel = eventCardLocationLabel(event)
  const namedArtists = event.artists.filter((artist) => artist.name.trim())
  const dateLabel = formatDiscoveryDate(event.date)
  const category =
    event.categoryId && event.categoryId !== "all"
      ? findCategory(categories ?? [], event.categoryId)
      : undefined
  const artistNames = namedArtists
    .slice(0, 3)
    .map((artist) => artist.name)
    .join(" · ")

  return (
    <article className="relative isolate mx-auto flex h-auto w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:shadow-none md:h-[460px] md:flex-row">
      <div className="relative z-10 order-2 flex w-full flex-col justify-between bg-white p-6 text-zinc-900 dark:bg-zinc-950 dark:text-white md:order-1 md:w-1/2 md:p-10">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {category ? (
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {category.label}
              </span>
            ) : null}
            <span className="flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-black tracking-wider text-black uppercase">
              <Star className="size-3 fill-current" aria-hidden="true" />
              Destacado
            </span>
          </div>

          <p className="text-sm font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
            {dateLabel}
          </p>
          <h2 className="mt-2 mb-3 line-clamp-2 text-3xl leading-tight font-black text-zinc-900 md:text-5xl dark:text-white">
            {event.title}
          </h2>
          <p className="mb-4 flex items-center gap-1 text-sm font-medium text-emerald-600/90 dark:text-emerald-400/90">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-1">{locationLabel}</span>
          </p>

          {namedArtists.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {namedArtists.slice(0, 3).map((artist) => (
                  <ArtistAvatar
                    key={artist.id || artist.name}
                    name={artist.name}
                    imageUrl={artist.imageUrl}
                    size="xs"
                    className="h-8 w-8 shrink-0 rounded-full border-2 border-white shadow-none dark:border-zinc-950"
                  />
                ))}
              </div>
              <span className="line-clamp-1 text-xs font-medium text-zinc-700 dark:text-white/90">
                {artistNames}
              </span>
            </div>
          ) : null}
        </div>

        <Button
          nativeButton={false}
          render={<Link href={href} />}
          className="group mt-6 flex h-auto w-full items-center justify-between rounded-2xl border-transparent bg-emerald-500 p-1 pl-6 text-base font-extrabold whitespace-nowrap text-black shadow-none transition-all hover:bg-emerald-400 hover:text-black"
        >
          <span>Comprar Entradas</span>
          <span className="flex items-center gap-2 rounded-xl bg-black/20 px-4 py-2.5 transition-colors group-hover:bg-black/30">
            <span className="text-sm font-black">{priceTag(event)}</span>
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </span>
        </Button>
      </div>

      <div className="relative order-1 h-72 w-full overflow-hidden md:order-2 md:h-full md:w-1/2">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={event.title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, 50vw"
            className="h-full w-full rounded-t-2xl object-cover object-center md:rounded-l-none md:rounded-r-2xl"
          />
        ) : null}

        <Link
          href={href}
          className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-inset"
          aria-label={`Ver ${event.title}`}
        />
      </div>
    </article>
  )
}
