"use client"

import { Flame } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EmptyState } from "@/components/discovery/empty-state"
import { EventCard } from "@/components/discovery/event-card"
import { FeaturedHeroSection } from "@/components/public/featured-hero-section"
import { HeroSection } from "@/components/discovery/hero-section"
import { OrganizerCtaBanner } from "@/components/discovery/organizer-cta-banner"
import { publishDiscoveryControls } from "@/components/discovery/discovery-controls-store"
import { useArgentinaProvinces } from "@/hooks/use-argentina-provinces"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import {
  DEFAULT_DISCOVERY_CATEGORIES,
  filterCatalogEvents,
  pickUpcoming,
} from "@/lib/discovery-filters"
import type { FeaturedRotationResult } from "@/lib/featured-rotation"
import { isFeaturedRailEligible } from "@/lib/featured-rotation"

export function DiscoveryHub({
  events,
  initialQuery = "",
  initialLocation = "todas",
  initialCategoryId = "all",
  initialArtistId = "",
  initialFeatured,
  categories = DEFAULT_DISCOVERY_CATEGORIES,
}: {
  events: CatalogEvent[]
  initialQuery?: string
  /** Nombre de provincia Georef, o `todas`. */
  initialLocation?: string
  /** UUID de categoría (o `all`). */
  initialCategoryId?: string
  /** UUID de artista (filtro de exploración desde la búsqueda omnicanal). */
  initialArtistId?: string
  /** Pool de destacados mezclado en el server (Fisher–Yates). */
  initialFeatured?: FeaturedRotationResult<CatalogEvent>
  /** Categorías / tags — hoy default local; mañana desde DB. */
  categories?: DiscoveryCategory[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { provinces, isLoading: locationsLoading } = useArgentinaProvinces()

  const [query, setQuery] = useState(initialQuery)
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [tagId, setTagId] = useState<string | null>(null)
  const [city, setCity] = useState(initialLocation)
  const artistId = initialArtistId.trim()

  useEffect(() => {
    publishDiscoveryControls({
      query,
      onQueryChange: setQuery,
      city,
      cities: provinces,
      onCityChange: setCity,
      events,
    })
    return () => publishDiscoveryControls(null)
  }, [query, city, provinces, events])

  useEffect(() => {
    const nextParams = new URLSearchParams()
    if (query.trim()) nextParams.set("q", query.trim())
    if (city && city !== "todas") nextParams.set("location", city)
    if (categoryId && categoryId !== "all") nextParams.set("category", categoryId)
    if (artistId) nextParams.set("artist", artistId)

    const currentParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams()

    const keys = new Set([
      ...nextParams.keys(),
      ...currentParams.keys(),
    ])
    let same = true
    for (const key of keys) {
      if ((nextParams.get(key) ?? "") !== (currentParams.get(key) ?? "")) {
        same = false
        break
      }
    }
    if (same) return

    const next = nextParams.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [query, city, categoryId, artistId, pathname, router])

  const featuredPool = useMemo(
    () => featuredPoolSafe(events, initialFeatured),
    [events, initialFeatured],
  )

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
    city !== "todas" ||
    Boolean(artistId)

  const gridEvents = isBrowsing ? filtered : events

  const resultsSubtitle = isBrowsing
    ? city !== "todas" && filtered.length === 0
      ? `Todavía no hay eventos en ${city}`
      : `${gridEvents.length} evento${gridEvents.length === 1 ? "" : "s"}`
    : `${gridEvents.length} evento${gridEvents.length === 1 ? "" : "s"}`

  return (
    <div className="space-y-12 sm:space-y-16">
      <HeroSection
        query={query}
        onQueryChange={setQuery}
        city={city}
        cities={provinces}
        onCityChange={setCity}
        locationsLoading={locationsLoading}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        tagId={tagId}
        onTagChange={setTagId}
        categories={categories}
        resultCount={filtered.length}
      />

      <FeaturedHeroSection pool={featuredPool} province={city} />

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
              {resultsSubtitle}
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

function featuredPoolSafe(
  events: CatalogEvent[],
  initialFeatured?: FeaturedRotationResult<CatalogEvent>,
) {
  if (initialFeatured?.pool && initialFeatured.pool.length > 0) {
    return initialFeatured.pool
  }
  return events.filter(isFeaturedRailEligible)
}
