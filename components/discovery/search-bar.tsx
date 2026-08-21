"use client"

import { ArrowRight, MapPin, Search, SlidersHorizontal } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"

import {
  MobileSearchTrigger,
  SearchFilterModal,
} from "@/components/discovery/search-filter-modal"
import type { CatalogEvent } from "@/app/actions/public-events"
import {
  DEFAULT_DISCOVERY_CATEGORIES,
  findCategory,
  type DiscoveryCategory,
} from "@/lib/discovery-categories"
import type { FeaturedDiscoveryArtist } from "@/lib/discovery-artists"
import type {
  DiscoveryDatePreset,
  DiscoveryFilterDraft,
} from "@/lib/discovery-filters"
import type { DiscoveryNicheId } from "@/lib/discovery-niches"
import { datePresetLabel } from "@/lib/discovery-filters"
import { usePublicSearchUiStore } from "@/lib/stores/public-search-ui-store"
import { cn } from "@/lib/utils"

type SearchBarProps = {
  events: CatalogEvent[]
  query: string
  onQueryChange: (value: string) => void
  city: string
  cities: string[]
  onCityChange: (value: string) => void
  locationsLoading?: boolean
  categoryId: string
  onCategoryChange: (value: string) => void
  tagId: string | null
  onTagChange: (value: string | null) => void
  selectedArtistId?: string
  datePreset?: DiscoveryDatePreset
  featuredArtists?: FeaturedDiscoveryArtist[]
  categories?: DiscoveryCategory[]
  niche?: DiscoveryNicheId
  onCommitFilters: (draft: DiscoveryFilterDraft) => void
  /** Solo monta el modal; el trigger vive en el Header. */
  hideTrigger?: boolean
}

function scrollToResults() {
  document.getElementById("discovery-results")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  })
}

function locationLabel(city: string, cities: string[]): string {
  if (city === "todas") return "Todas las ubicaciones"
  return (
    cities.find((item) => item.toLowerCase() === city.toLowerCase()) ?? city
  )
}

export function SearchBar({
  events,
  query,
  city,
  cities,
  locationsLoading = false,
  categoryId,
  tagId,
  selectedArtistId = "",
  datePreset = "all",
  featuredArtists = [],
  categories = DEFAULT_DISCOVERY_CATEGORIES,
  niche = "all",
  onCommitFilters,
  hideTrigger = false,
}: SearchBarProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const filterPending = usePublicSearchUiStore((state) => state.filterPending)
  const consumeFilters = usePublicSearchUiStore((state) => state.consumeFilters)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!filterPending) return
    setFilterOpen(true)
    consumeFilters()
  }, [consumeFilters, filterPending])

  const category = findCategory(categories, categoryId)
  const cityLabel = locationLabel(city, cities)
  const selectedArtistName =
    featuredArtists.find((artist) => artist.id === selectedArtistId)?.name ??
    null

  const mobileSummary = useMemo(() => {
    const parts = [
      category && category.id !== "all" ? category.label : null,
      selectedArtistName,
      city !== "todas" ? cityLabel : null,
      datePreset !== "all" ? datePresetLabel(datePreset) : null,
      query.trim() || null,
    ].filter(Boolean)
    return parts.length ? parts.join(" · ") : "Buscar filtros"
  }, [category, city, cityLabel, datePreset, query, selectedArtistName])

  const segmentDivider = (
    <span
      className="hidden h-8 w-px shrink-0 self-center bg-border md:block"
      aria-hidden="true"
    />
  )

  const filterModal = (
    <SearchFilterModal
      open={filterOpen}
      onOpenChange={setFilterOpen}
      events={events}
      query={query}
      city={city}
      cities={cities}
      locationsLoading={locationsLoading}
      categoryId={categoryId}
      tagId={tagId}
      selectedArtistId={selectedArtistId}
      datePreset={datePreset}
      featuredArtists={featuredArtists}
      categories={categories}
      niche={niche}
      onCommit={onCommitFilters}
      onApply={scrollToResults}
    />
  )

  if (hideTrigger) return filterModal

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.4, delay: 0.08, ease: "easeOut" }
      }
      className="mx-auto w-full max-w-4xl px-4 lg:px-0 motion-reduce:transform-none"
    >
      <MobileSearchTrigger
        onClick={() => setFilterOpen(true)}
        summary={mobileSummary}
      />

      {filterModal}

      <button
        type="button"
        onClick={() => setFilterOpen(true)}
        className={cn(
          "mx-auto hidden w-full items-stretch rounded-full border text-left shadow-sm backdrop-blur-xl transition-shadow hover:shadow-md md:flex",
          "border-border bg-card/90",
        )}
        aria-haspopup="dialog"
        aria-expanded={filterOpen}
        aria-label="Abrir búsqueda y filtros"
      >
        <span className="group relative flex min-w-0 flex-[1.4] flex-col justify-center gap-0.5 rounded-l-full px-5 py-3 transition hover:bg-secondary/60">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Buscar
          </span>
          <span className="flex items-center gap-2">
            <Search
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-base font-medium md:text-sm",
                query.trim()
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {query.trim() || "Buscá por evento, artista o lugar..."}
            </span>
          </span>
        </span>

        {segmentDivider}

        <span className="flex min-w-0 flex-1 flex-col justify-center px-2 py-2">
          <span className="px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Ubicación
          </span>
          <span className="flex min-w-0 items-center gap-2 px-3 py-1.5">
            <MapPin
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate text-sm font-medium text-foreground">
              {locationsLoading && cities.length === 0 && city === "todas"
                ? "Cargando…"
                : cityLabel}
            </span>
          </span>
        </span>

        {segmentDivider}

        <span className="flex min-w-0 flex-1 flex-col justify-center px-2 py-2">
          <span className="px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Categoría
          </span>
          <span className="flex min-w-0 items-center gap-2 px-3 py-1.5">
            <SlidersHorizontal
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate text-sm font-medium text-foreground">
              {category?.label ?? "Todos los eventos"}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center p-1.5 pl-1">
          <span
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-primary-foreground",
              "bg-primary shadow-sm transition hover:bg-primary/90",
            )}
          >
            Descubrir shows
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
          </span>
        </span>
      </button>
    </motion.div>
  )
}
