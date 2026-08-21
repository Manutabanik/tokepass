import Image from "next/image"
import Link from "next/link"
import { Calendar, MapPin, Sparkles, Ticket } from "lucide-react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { TokepassGuaranteeBadge } from "@/components/shared/tokepass-guarantee-badge"
import { Button } from "@/components/ui/button"
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
  const href = publicEventPath(event)
  const locationLabel =
    city && city !== place ? `${place} · ${city}` : place

  return (
    <article
      className={cn(
        "relative mx-auto flex w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xl",
        "md:flex-row md:items-stretch",
      )}
    >
      <div className="relative order-1 aspect-[4/3] w-full overflow-hidden md:order-2 md:aspect-[4/3] md:w-1/2 lg:w-7/12">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={event.title}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, 58vw"
            className="object-cover object-center"
          />
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-card to-zinc-900"
            aria-hidden
          />
        )}
      </div>

      <div className="order-2 flex w-full flex-col justify-center space-y-4 bg-card p-5 dark:bg-card md:order-1 md:w-1/2 md:space-y-6 md:p-8 lg:w-5/12 lg:p-10">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold tracking-wider text-emerald-500 uppercase">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Destacado
        </span>

        <h2 className="line-clamp-2 break-words text-2xl font-black tracking-tight text-foreground dark:text-white md:text-3xl lg:text-4xl">
          <Link href={href} className="hover:underline">
            {event.title}
          </Link>
        </h2>

        <div className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
            <span>{formatDiscoveryDateTime(event.date)}</span>
          </p>
          <p className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
            <span className="truncate">{locationLabel}</span>
          </p>
        </div>

        <TokepassGuaranteeBadge variant="full" />

        <Button
          size="lg"
          className="h-auto w-full rounded-2xl bg-emerald-500 py-6 font-extrabold text-black shadow-lg hover:bg-emerald-400 md:w-auto"
          nativeButton={false}
          render={<Link href={href} />}
        >
          Conseguí tus entradas
          <Ticket className="ml-2 h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
    </article>
  )
}
