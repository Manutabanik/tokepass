"use client"

/** Hero Living Stage — cartelera cinemática B2C (dark + light). */
import { motion } from "motion/react"

import { SearchBar } from "@/components/discovery/search-bar"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import { DEFAULT_DISCOVERY_CATEGORIES } from "@/lib/discovery-categories"

type HeroSectionProps = {
  query: string
  onQueryChange: (value: string) => void
  city: string
  cities: string[]
  onCityChange: (value: string) => void
  categoryId: string
  onCategoryChange: (value: string) => void
  tagId: string | null
  onTagChange: (value: string | null) => void
  categories?: DiscoveryCategory[]
  resultCount: number
}

export function HeroSection({
  query,
  onQueryChange,
  city,
  cities,
  onCityChange,
  categoryId,
  onCategoryChange,
  tagId,
  onTagChange,
  categories = DEFAULT_DISCOVERY_CATEGORIES,
  resultCount,
}: HeroSectionProps) {
  return (
    <section className="relative overflow-x-clip pb-4 pt-10 sm:pb-6 sm:pt-14 lg:pt-20">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto flex max-w-4xl flex-col items-center px-5 text-center"
      >
        <h1 className="text-balance text-4xl font-black leading-[1.05] tracking-tight text-zinc-900 sm:text-5xl dark:text-white lg:text-7xl lg:leading-none">
          <span className="block lg:inline">Tu próxima gran noche </span>
          <span className="mt-1 block bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text pb-1 text-transparent sm:mt-1.5 dark:from-violet-400 dark:via-fuchsia-400 dark:to-cyan-400 dark:drop-shadow-[0_0_35px_rgba(168,85,247,0.45)] lg:mt-0 lg:inline">
            empieza acá.
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-pretty text-sm leading-relaxed text-zinc-600 sm:mt-6 sm:text-base dark:text-slate-300/90 lg:text-lg">
          Descubrí las mejores fiestas, festivales y recitales de tu ciudad.
          Asegurá tu lugar en 2 clicks y llevá tu entrada 100% offline.
        </p>
      </motion.div>

      <div className="mx-auto mt-8 w-full max-w-4xl sm:mt-10">
        <SearchBar
          query={query}
          onQueryChange={onQueryChange}
          city={city}
          cities={cities}
          onCityChange={onCityChange}
          categoryId={categoryId}
          onCategoryChange={onCategoryChange}
          tagId={tagId}
          onTagChange={onTagChange}
          categories={categories}
          resultCount={resultCount}
        />
      </div>
    </section>
  )
}
