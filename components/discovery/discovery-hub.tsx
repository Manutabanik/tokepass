"use client"

import { Flame } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EmptyState } from "@/components/discovery/empty-state"
import { EventCard } from "@/components/discovery/event-card"
import { FeaturedCarousel } from "@/components/discovery/featured-carousel"
import { HeroSection } from "@/components/discovery/hero-section"
import { OrganizerCtaBanner } from "@/components/discovery/organizer-cta-banner"
import { publishDiscoveryControls } from "@/components/discovery/discovery-controls-store"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import {
  DEFAULT_DISCOVERY_CATEGORIES,
  extractCities,
  filterCatalogEvents,
  pickUpcoming,
} from "@/lib/discovery-filters"
import type { FeaturedRotationResult } from "@/lib/featured-rotation"
import { isFeaturedRailEligible } from "@/lib/featured-rotation"

export function DiscoveryHub({
  events,
  initialQuery = "",
  initialFeatured,
  categories = DEFAULT_DISCOVERY_CATEGORIES,
}: {
  events: CatalogEvent[]
  initialQuery?: string
  /** Pool de destacados mezclado en el server (Fisher–Yates). */
  initialFeatured?: FeaturedRotationResult<CatalogEvent>
  /** Categorías / tags — hoy default local; mañana desde DB. */
  categories?: DiscoveryCategory[]
}) {
  const [query, setQuery] = useState(initialQuery)
  const [categoryId, setCategoryId] = useState("all")
  const [tagId, setTagId] = useState<string | null>(null)
  const [city, setCity] = useState("todas")

  const cities = useMemo(() => extractCities(events), [events])

  const featuredPool = useMemo(() => {
    if (initialFeatured?.pool && initialFeatured.pool.length > 0) {
      return initialFeatured.pool
    }
    return events.filter(isFeaturedRailEligible)
  }, [events, initialFeatured])

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
    () =>
      filterCatalogEvents(events, {
        query,
        categoryId,
        tagId,
        city,
        categories,
      }),
    [events, query, categoryId, tagId, city, categories],
  )

  const isBrowsing =
    query.trim().length > 0 ||
    categoryId !== "all" ||
    tagId != null ||
    city !== "todas"

  const gridEvents = isBrowsing ? filtered : events

  return (
    <div className="space-y-12 sm:space-y-16">
      <HeroSection
        query={query}
        onQueryChange={setQuery}
        city={city}
        cities={cities}
        onCityChange={setCity}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        tagId={tagId}
        onTagChange={setTagId}
        categories={categories}
        resultCount={filtered.length}
      />

      <FeaturedCarousel pool={featuredPool} province={city} />

      <section className="space-y-6" id="discovery-results">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-purple-600" aria-hidden="true" />
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                {isBrowsing ? "Resultados" : "Lo más vendido de la semana"}
              </h2>
            </div>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              {gridEvents.length} evento{gridEvents.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {gridEvents.length > 0 ? (
            <motion.div
              key={`${categoryId}-${tagId}-${city}-${query}-${isBrowsing}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
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
