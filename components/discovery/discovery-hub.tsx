"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EmptyState } from "@/components/discovery/empty-state"
import { EventCard } from "@/components/discovery/event-card"
import { FeaturedCarousel } from "@/components/discovery/featured-carousel"
import { FilterPills } from "@/components/discovery/filter-pills"
import { OrganizerCtaBanner } from "@/components/discovery/organizer-cta-banner"
import { publishDiscoveryControls } from "@/components/discovery/discovery-controls-store"
import {
  extractCities,
  filterCatalogEvents,
  pickUpcoming,
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

  useEffect(() => {
    publishDiscoveryControls({
      query,
      onQueryChange: setQuery,
      city,
      cities,
      onCityChange: setCity,
      events,
    })
    return () => publishDiscoveryControls(null)
  }, [query, city, cities, events])

  const filtered = useMemo(
    () => filterCatalogEvents(events, { query, mood, city }),
    [events, query, mood, city],
  )

  const featured = useMemo(() => {
    const rail = pickFeaturedRail(events)
    if (rail.length > 0) return rail.slice(0, 8)
    return pickUpcoming(events, 6)
  }, [events])

  const isBrowsing =
    query.trim().length > 0 || mood !== "all" || city !== "todas"

  const gridEvents = isBrowsing ? filtered : events

  return (
    <div className="space-y-12 sm:space-y-16">
      {!isBrowsing ? <FeaturedCarousel events={featured} /> : null}

      <section className="space-y-6" id="discovery-results">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Cartelera
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              {isBrowsing ? "Resultados" : "Próximos eventos"}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-500">
              {gridEvents.length} evento{gridEvents.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <FilterPills mood={mood} onMoodChange={setMood} />

        <AnimatePresence mode="wait">
          {gridEvents.length > 0 ? (
            <motion.div
              key={`${mood}-${city}-${query}-${isBrowsing}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
            >
              {gridEvents.map((event, index) => (
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
              <EmptyState fallbackEvents={pickUpcoming(events)} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <OrganizerCtaBanner />
    </div>
  )
}
