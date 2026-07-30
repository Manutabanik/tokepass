"use client"

import {
  ArrowRight,
  Crown,
  Flame,
  MapPin,
  Ticket,
} from "lucide-react"
import { motion } from "motion/react"
import Image from "next/image"
import Link from "next/link"

import type { CatalogEvent } from "@/app/actions/public-events"
import { eventCityLabel, urgencyLabel } from "@/lib/discovery-filters"
import { formatCurrency, formatDiscoveryDate } from "@/lib/format"
import { isBoostActive } from "@/lib/services/events-service"
import { cn } from "@/lib/utils"

const fallbackGradients = [
  "from-[#030712] via-[#1e1b4b] to-[#831843]",
  "from-[#030712] via-[#0e7490] to-[#312e81]",
  "from-[#030712] via-[#4c1d95] to-[#155e75]",
  "from-[#030712] via-[#9d174d] to-[#0f766e]",
]

function gradientForId(id: string) {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % fallbackGradients.length
  }
  return fallbackGradients[hash] ?? fallbackGradients[0]
}

export function EventCard({
  event,
  priority = false,
  index = 0,
}: {
  event: CatalogEvent
  priority?: boolean
  index?: number
}) {
  const urgency = urgencyLabel(event)
  const city = eventCityLabel(event)
  const place = event.venueName ?? event.location
  const boosted = isBoostActive(event)

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-24px" }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.2) }}
      className="h-full"
    >
      <Link
        href={`/events/${event.id}`}
        className={cn(
          "group relative flex h-full flex-col overflow-hidden rounded-2xl",
          "border border-white/10 bg-slate-950/55 backdrop-blur-xl",
          "transition-all duration-300",
          "hover:-translate-y-1.5 hover:border-fuchsia-500/60",
          "hover:shadow-[0_10px_30px_rgba(168,85,247,0.3)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50",
        )}
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          {event.imageUrl ? (
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              priority={priority}
              sizes="(max-width: 640px) 85vw, (max-width: 1024px) 45vw, 25vw"
              className="object-cover transition-transform duration-500 ease-out will-change-transform group-hover:scale-[1.05]"
            />
          ) : (
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-br transition-transform duration-500 group-hover:scale-[1.05]",
                gradientForId(event.id),
              )}
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />

          <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
            {boosted ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-50 shadow-[0_0_14px_rgba(251,191,36,0.35)] backdrop-blur-md">
                <Crown className="size-3" aria-hidden="true" />
                Destacado
              </span>
            ) : null}
            {urgency ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/45 bg-rose-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-50 shadow-[0_0_14px_rgba(244,63,94,0.4)] backdrop-blur-md">
                <Flame className="size-3" aria-hidden="true" />
                Agotando Preventa
              </span>
            ) : null}
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-white/95 backdrop-blur-md">
              <MapPin className="size-3 shrink-0 text-cyan-300" aria-hidden="true" />
              <span className="truncate">{city}</span>
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200/90">
              {formatDiscoveryDate(event.date)}
            </p>
            <h3 className="line-clamp-2 text-xl font-black leading-tight tracking-[-0.03em] text-white">
              {event.title}
            </h3>
            <p className="truncate text-sm text-slate-300">{place}</p>
          </div>
        </div>

        <div className="relative flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Desde
            </p>
            <p className="truncate text-base font-extrabold text-white">
              {event.startingPrice != null
                ? formatCurrency(event.startingPrice)
                : "Ver precios"}
            </p>
          </div>

          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3.5 py-2.5 text-sm font-bold text-white",
              "shadow-[0_0_18px_rgba(168,85,247,0.35)]",
            )}
          >
            <Ticket className="size-3.5" aria-hidden="true" />
            Conseguir Entrada
            <ArrowRight className="size-3.5 opacity-90" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </motion.article>
  )
}
