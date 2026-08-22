"use client"

import { Flame } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useTransition,
  type WheelEvent,
} from "react"

import { useDebounce } from "@/hooks/use-debounce"

import type { CatalogEvent } from "@/app/actions/public-events"
import { EmptyState } from "@/components/discovery/empty-state"
import { EventCard } from "@/components/discovery/event-card"
import { SearchBar } from "@/components/discovery/search-bar"
import { FeaturedHeroSection } from "@/components/public/featured-hero-section"
import { OrganizerCtaBanner } from "@/components/discovery/organizer-cta-banner"
import { publishDiscoveryControls } from "@/components/discovery/discovery-controls-store"
import { useArgentinaProvinces } from "@/hooks/use-argentina-provinces"
import {
  DISCOVERY_FILTER_ARTISTS_LIMIT,
  rankFeaturedArtistsFromCatalog,
  type FeaturedDiscoveryArtist,
} from "@/lib/discovery-artists"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import {
  DEFAULT_DISCOVERY_CATEGORIES,
  catalogFiltersFromSearchParams,
  catalogSearchParams,
  filterCatalogEvents,
  parseDatePreset,
  pickUpcoming,
  type DiscoveryDatePreset,
  type DiscoveryFilterDraft,
} from "@/lib/discovery-filters"
import { type DiscoveryNicheId } from "@/lib/discovery-niches"
import type { FeaturedRotationResult } from "@/lib/featured-rotation"
import { isFeaturedRailEligible } from "@/lib/featured-rotation"

const EMPTY_SEARCH_PARAMS = new URLSearchParams()

type DiscoveryHubProps = {
  events: CatalogEvent[]
  initialQuery?: string
  /** Nombre de provincia Georef, o `todas`. */
  initialLocation?: string
  /** UUID de categoría (o `all`). */
  initialCategoryId?: string
  /** UUID de artista (filtro de exploración desde la búsqueda omnicanal). */
  initialArtistId?: string
  initialDatePreset?: string
  /** Pool de destacados mezclado en el server (Fisher–Yates). */
  initialFeatured?: FeaturedRotationResult<CatalogEvent>
  featuredArtists?: FeaturedDiscoveryArtist[]
  /** Categorías / tags — hoy default local; mañana desde DB. */
  categories?: DiscoveryCategory[]
  variant?: "landing" | "directory"
}

export function DiscoveryHub(props: DiscoveryHubProps) {
  return (
    <Suspense
      fallback={
        <DiscoveryHubInner
          {...props}
          searchParams={EMPTY_SEARCH_PARAMS}
          enableUrlSync={false}
        />
      }
    >
      <DiscoveryHubWithSearchParams {...props} />
    </Suspense>
  )
}

function DiscoveryHubWithSearchParams(props: DiscoveryHubProps) {
  const searchParams = useSearchParams()
  return (
    <DiscoveryHubInner
      {...props}
      searchParams={searchParams}
      enableUrlSync
    />
  )
}

function DiscoveryHubInner({
  events,
  initialQuery = "",
  initialLocation = "todas",
  initialCategoryId = "all",
  initialArtistId = "",
  initialDatePreset = "all",
  initialFeatured,
  featuredArtists = [],
  categories = DEFAULT_DISCOVERY_CATEGORIES,
  variant = "landing",
  searchParams,
  enableUrlSync,
}: DiscoveryHubProps & {
  searchParams: { get(name: string): string | null }
  enableUrlSync: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { provinces, isLoading: locationsLoading } = useArgentinaProvinces()
  const [, startTransition] = useTransition()

  const urlFilters = catalogFiltersFromSearchParams(searchParams)
  const urlKey = catalogSearchParams({
    q: urlFilters.query,
    location: urlFilters.location,
    category: urlFilters.categoryId,
    artist: urlFilters.artistId,
    when: urlFilters.datePreset,
    niche: urlFilters.niche,
  }).toString()
  const [query, setQuery] = useState(
    enableUrlSync ? urlFilters.query : initialQuery,
  )
  const [categoryId, setCategoryId] = useState(
    enableUrlSync ? urlFilters.categoryId : initialCategoryId,
  )
  const [tagId, setTagId] = useState<string | null>(null)
  const [city, setCity] = useState(
    enableUrlSync ? urlFilters.location : initialLocation,
  )
  const [artistId, setArtistId] = useState(
    enableUrlSync ? urlFilters.artistId : initialArtistId.trim(),
  )
  const [datePreset, setDatePreset] = useState<DiscoveryDatePreset>(
    enableUrlSync
      ? urlFilters.datePreset
      : parseDatePreset(initialDatePreset),
  )
  const [niche, setNiche] = useState<DiscoveryNicheId>(
    enableUrlSync ? urlFilters.niche : "all",
  )
  const debouncedQuery = useDebounce(query, 450)
  const isBrowsing =
    query.trim().length > 0 ||
    categoryId !== "all" ||
    tagId != null ||
    city !== "todas" ||
    Boolean(artistId) ||
    datePreset !== "all" ||
    niche !== "all"

  useLayoutEffect(() => {
    if (!enableUrlSync) return
    queueMicrotask(() => {
      setQuery(urlFilters.query)
      setCity(urlFilters.location)
      setCategoryId(urlFilters.categoryId)
      setArtistId(urlFilters.artistId)
      setDatePreset(urlFilters.datePreset)
      setNiche(urlFilters.niche)
    })
  }, [
    enableUrlSync,
    urlFilters.artistId,
    urlFilters.categoryId,
    urlFilters.datePreset,
    urlFilters.location,
    urlFilters.niche,
    urlFilters.query,
  ])

  useEffect(() => {
    publishDiscoveryControls({
      query,
      onQueryChange: setQuery,
      city,
      cities: provinces,
      onCityChange: setCity,
      events,
      hasActiveFilters: isBrowsing,
    })
    return () => publishDiscoveryControls(null)
  }, [query, city, provinces, events, isBrowsing])

  useEffect(() => {
    if (!enableUrlSync) return
    if (query !== debouncedQuery) return

    const nextParams = catalogSearchParams({
      q: debouncedQuery,
      location: city,
      category: categoryId,
      artist: artistId,
      when: datePreset,
      niche,
    })
    if (nextParams.toString() === urlKey) return

    const next = nextParams.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [
    artistId,
    categoryId,
    city,
    datePreset,
    niche,
    debouncedQuery,
    enableUrlSync,
    pathname,
    query,
    router,
    urlKey,
  ])

  const featuredPool = useMemo(
    () => featuredPoolSafe(events, initialFeatured),
    [events, initialFeatured],
  )

  const resolvedFeaturedArtists = useMemo(() => {
    const catalog = rankFeaturedArtistsFromCatalog(
      events,
      DISCOVERY_FILTER_ARTISTS_LIMIT,
    )
    const merged: FeaturedDiscoveryArtist[] = []
    const seen = new Set<string>()
    for (const artist of [...featuredArtists, ...catalog]) {
      if (!artist.id || seen.has(artist.id)) continue
      seen.add(artist.id)
      merged.push(artist)
    }
    if (artistId && !seen.has(artistId)) {
      const selected = events
        .flatMap((event) => event.artists ?? [])
        .find((artist) => artist.id === artistId)
      if (selected) {
        merged.unshift({ ...selected, activeEventCount: 1 })
      }
    }
    return merged.slice(0, DISCOVERY_FILTER_ARTISTS_LIMIT)
  }, [artistId, events, featuredArtists])

  const filtered = useMemo(
    () =>
      filterCatalogEvents(events, {
        query,
        categoryId,
        tagId,
        city,
        artistId,
        datePreset,
        categories,
        niche,
      }),
    [events, query, categoryId, tagId, city, artistId, datePreset, categories, niche],
  )

  function commitFilters(draft: DiscoveryFilterDraft) {
    startTransition(() => {
      setQuery(draft.query)
      setCategoryId(draft.categoryId)
      setTagId(draft.tagId)
      setCity(draft.city)
      setArtistId(draft.artistId)
      setDatePreset(draft.datePreset)
      setNiche(draft.niche ?? "all")
    })
  }

  const gridEvents = isBrowsing ? filtered : events

  const resultsSubtitle = isBrowsing
    ? city !== "todas" && filtered.length === 0
      ? `Todavía no hay eventos en ${city}`
      : `${gridEvents.length} evento${gridEvents.length === 1 ? "" : "s"}`
    : `${gridEvents.length} evento${gridEvents.length === 1 ? "" : "s"}`

  const resultsGrid = (
    <AnimatePresence mode="wait">
      {gridEvents.length > 0 ? (
        <motion.div
          key="results-grid"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={
            variant === "directory"
              ? "flex flex-col gap-3"
              : "w-full min-w-0 max-w-full"
          }
        >
          {variant === "directory" ? (
            gridEvents.map((event, index) => (
              <EventCard
                key={event.id}
                event={event}
                index={index}
                priority={index < 3}
                variant="list"
                categories={categories}
              />
            ))
          ) : (
            <UpcomingEventsRail events={gridEvents} categories={categories} />
          )}
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
  )

  if (variant === "directory") {
    return (
      <div className="space-y-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4 pb-2 md:px-0 md:pt-6">
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Cartelera de eventos
          </h1>
          <SearchBar
            events={events}
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
            selectedArtistId={artistId}
            datePreset={datePreset}
            featuredArtists={resolvedFeaturedArtists}
            categories={categories}
            niche={niche}
            onCommitFilters={commitFilters}
          />
        </div>

        <section
          className="mx-auto max-w-3xl space-y-4 px-4 md:px-0"
          id="discovery-results"
        >
          <p className="text-sm text-muted-foreground">{resultsSubtitle}</p>
          {resultsGrid}
        </section>
      </div>
    )
  }

  const searchFilters = (
    <SearchBar
      hideTrigger
      events={events}
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
      selectedArtistId={artistId}
      datePreset={datePreset}
      featuredArtists={resolvedFeaturedArtists}
      categories={categories}
      niche={niche}
      onCommitFilters={commitFilters}
    />
  )

  return (
    <div className="w-full min-w-0 max-w-full space-y-10 overflow-x-hidden bg-transparent sm:space-y-12">
      <FeaturedHeroSection
        pool={featuredPool}
        province={city}
        categories={categories}
      />
      {searchFilters}

      <section className="min-w-0 space-y-6" id="discovery-results">
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-purple-600" aria-hidden="true" />
              <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                {isBrowsing ? "Resultados" : "Próximos eventos"}
              </h2>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {resultsSubtitle}
            </p>
          </div>
        </div>

        {resultsGrid}
      </section>

      <OrganizerCtaBanner />
    </div>
  )
}

function UpcomingEventsRail({
  events,
  categories,
}: {
  events: CatalogEvent[]
  categories?: DiscoveryCategory[]
}) {
  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.deltaY === 0) return
    event.currentTarget.scrollLeft += event.deltaY
  }

  return (
    <div
      onWheel={handleWheel}
      className="-mx-4 flex w-full cursor-grab gap-4 overflow-x-auto overflow-y-hidden px-4 py-4 snap-x snap-mandatory touch-pan-x scrollbar-none active:cursor-grabbing md:mx-0 md:px-0"
    >
      {events.map((event, index) => (
        <div
          key={event.id}
          className="w-[220px] shrink-0 snap-start touch-pan-x sm:w-[260px]"
        >
          <EventCard
            event={event}
            index={index}
            priority={index < 4}
            categories={categories}
          />
        </div>
      ))}
    </div>
  )
}

function featuredPoolSafe(
  events: CatalogEvent[],
  initialFeatured?: FeaturedRotationResult<CatalogEvent>,
) {
  const source =
    initialFeatured?.pool && initialFeatured.pool.length > 0
      ? initialFeatured.pool
      : events.filter(isFeaturedRailEligible)

  if (events.length === 0) return source

  const catalogById = new Map(events.map((event) => [event.id, event]))
  return source.map((event) => {
    const catalog = catalogById.get(event.id)
    if (!catalog) return event
    return {
      ...event,
      artists: event.artists.length > 0 ? event.artists : catalog.artists,
      startingPrice: event.startingPrice ?? catalog.startingPrice,
    }
  })
}
