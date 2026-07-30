"use client"

import { CalendarDays, Crown, Flame, Rocket, Zap } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useMemo, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EmptyState } from "@/components/discovery/empty-state"
import { EventCard } from "@/components/discovery/event-card"
import { EventRail } from "@/components/discovery/event-rail"
import { HeroSection } from "@/components/discovery/hero-section"
import {
  extractCities,
  filterCatalogEvents,
  pickFestivals,
  pickTopSellers,
  pickTonight,
  pickUpcoming,
  pickWeekend,
  type DiscoveryMoodId,
} from "@/lib/discovery-filters"
import { pickFeaturedRail } from "@/lib/services/events-service"

export function DiscoveryHub({
  events,
  initialQuery = "",
}: {
  events: CatalogEvent[]
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const [mood, setMood] = useState<DiscoveryMoodId>("all")
  const [city, setCity] = useState("todas")

  const cities = useMemo(() => extractCities(events), [events])

  const filtered = useMemo(
    () => filterCatalogEvents(events, { query, mood, city }),
    [events, query, mood, city],
  )

  const topSellers = useMemo(() => pickTopSellers(events), [events])
  const featured = useMemo(() => pickFeaturedRail(events), [events])
  const tonight = useMemo(() => pickTonight(events), [events])
  const weekend = useMemo(() => pickWeekend(events), [events])
  const festivals = useMemo(() => {
    const tagged = pickFestivals(events)
    return tagged.length > 0 ? tagged : pickUpcoming(events)
  }, [events])
  const fallback = useMemo(
    () => pickUpcoming(events.length > 0 ? events : topSellers),
    [events, topSellers],
  )

  const isBrowsing =
    query.trim().length > 0 || mood !== "all" || city !== "todas"

  return (
    <div className="space-y-8 sm:space-y-12">
      <HeroSection
        query={query}
        onQueryChange={setQuery}
        city={city}
        cities={cities}
        onCityChange={setCity}
        mood={mood}
        onMoodChange={setMood}
      />

      {!isBrowsing ? (
        <div
          id="discovery-results"
          className="mt-10 scroll-mt-24 space-y-10 px-1 sm:space-y-12 sm:px-0 lg:mt-16"
        >
          <EventRail
            title="Destacados Tokepass Boost"
            icon={Crown}
            events={featured}
          />
          <EventRail title="Hoy se sale" icon={Zap} events={tonight} />
          <EventRail
            title="Lo más vendido de la semana"
            icon={Flame}
            events={topSellers}
          />
          <EventRail
            title="Este Fin de Semana"
            icon={CalendarDays}
            events={weekend}
          />
          <EventRail
            title="Festivales & Masivos"
            icon={Rocket}
            events={festivals}
          />

          {events.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                Toda la cartelera
              </h2>
              <motion.div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-40px" }}
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.04 } },
                }}
              >
                {events.map((event, index) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={index}
                    priority={index < 3}
                  />
                ))}
              </motion.div>
            </section>
          ) : (
            <EmptyState fallbackEvents={[]} />
          )}
        </div>
      ) : (
        <section
          id="discovery-results"
          className="mt-10 scroll-mt-24 space-y-5 px-1 sm:px-0 lg:mt-16"
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold tracking-wide text-white">
                <span
                  className="size-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                  aria-hidden="true"
                />
                Resultados
              </h2>
              <p className="mt-1.5 text-sm text-zinc-500">
                {filtered.length} evento{filtered.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {filtered.length > 0 ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {filtered.map((event, index) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={index}
                    priority={index < 3}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EmptyState fallbackEvents={fallback} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  )
}
