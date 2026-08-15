"use client"

/** Hero Living Stage — cartelera cinemática B2C (dark + light). */
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"

import { SearchBar } from "@/components/discovery/search-bar"
import type { CatalogEvent } from "@/app/actions/public-events"
import type { FeaturedDiscoveryArtist } from "@/lib/discovery-artists"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import { DEFAULT_DISCOVERY_CATEGORIES } from "@/lib/discovery-categories"
import type {
  DiscoveryDatePreset,
  DiscoveryFilterDraft,
} from "@/lib/discovery-filters"

type HeroSectionProps = {
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
  onCommitFilters: (draft: DiscoveryFilterDraft) => void
}

export function HeroSection({
  events,
  query,
  onQueryChange,
  city,
  cities,
  onCityChange,
  locationsLoading = false,
  categoryId,
  onCategoryChange,
  tagId,
  onTagChange,
  selectedArtistId,
  datePreset,
  featuredArtists,
  categories = DEFAULT_DISCOVERY_CATEGORIES,
  onCommitFilters,
}: HeroSectionProps) {
  const reduceMotion = useReducedMotion()
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    function sync() {
      setIsMobile(mq.matches)
    }
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const skipMotion = Boolean(reduceMotion || isMobile)

  return (
    <section className="relative overflow-x-clip pb-4 pt-10 sm:pb-6 sm:pt-14 lg:pt-20">
      <motion.div
        initial={skipMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          skipMotion
            ? { duration: 0 }
            : { duration: 0.5, ease: "easeOut" }
        }
        className="mx-auto flex max-w-4xl flex-col items-center px-5 text-center"
      >
        <h1 className="text-balance text-4xl font-black leading-[1.05] tracking-tight text-zinc-900 sm:text-5xl dark:text-white lg:text-7xl lg:leading-none">
          <span className="block lg:inline">Tu próxima gran noche </span>
          <span className="mt-1 block bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text pb-1 text-transparent sm:mt-1.5 dark:from-violet-400 dark:via-fuchsia-400 dark:to-cyan-400 dark:drop-shadow-[0_0_35px_rgba(168,85,247,0.45)] lg:mt-0 lg:inline">
            empieza acá.
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-600 sm:mt-6 dark:text-slate-300/90 lg:text-lg">
          Descubrí las mejores fiestas, festivales y recitales de tu ciudad.
          Asegurá tu lugar en 2 clicks y llevá tu entrada 100% offline.
        </p>
      </motion.div>

      <div className="mx-auto mt-8 w-full max-w-4xl sm:mt-10">
        <SearchBar
          events={events}
          query={query}
          onQueryChange={onQueryChange}
          city={city}
          cities={cities}
          onCityChange={onCityChange}
          locationsLoading={locationsLoading}
          categoryId={categoryId}
          onCategoryChange={onCategoryChange}
          tagId={tagId}
          onTagChange={onTagChange}
          selectedArtistId={selectedArtistId}
          datePreset={datePreset}
          featuredArtists={featuredArtists}
          categories={categories}
          onCommitFilters={onCommitFilters}
        />
      </div>
    </section>
  )
}
