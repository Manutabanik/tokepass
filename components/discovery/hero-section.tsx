"use client"

/** Hero Living Stage — cartelera cinemática B2C. */
import { motion } from "motion/react"

import { FilterPills } from "@/components/discovery/filter-pills"
import { SearchBar } from "@/components/discovery/search-bar"
import type { DiscoveryMoodId } from "@/lib/discovery-filters"

type HeroSectionProps = {
  query: string
  onQueryChange: (value: string) => void
  city: string
  cities: string[]
  onCityChange: (value: string) => void
  mood: DiscoveryMoodId
  onMoodChange: (value: DiscoveryMoodId) => void
}

export function HeroSection({
  query,
  onQueryChange,
  city,
  cities,
  onCityChange,
  mood,
  onMoodChange,
}: HeroSectionProps) {
  return (
    <section className="relative overflow-x-clip pb-2 pt-8 sm:pt-12 lg:pt-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto flex max-w-4xl flex-col items-center px-5 text-center"
      >
        <h1 className="text-balance text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-7xl lg:leading-none">
          <span className="block lg:inline">Tu próxima gran noche </span>
          <span className="mt-1 block bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-400 bg-clip-text pb-1 text-transparent drop-shadow-[0_0_35px_rgba(168,85,247,0.5)] sm:mt-1.5 lg:mt-0 lg:inline">
            empieza acá.
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-pretty text-sm leading-relaxed text-slate-300/90 sm:mt-6 sm:text-base lg:text-lg">
          Descubrí las mejores fiestas, festivales y recitales de tu ciudad.
          Asegurá tu lugar en 2 clicks y llevá tu entrada 100% offline.
        </p>
      </motion.div>

      <div className="mx-auto mt-8 w-full max-w-4xl space-y-2 sm:mt-10">
        <SearchBar
          query={query}
          onQueryChange={onQueryChange}
          city={city}
          cities={cities}
          onCityChange={onCityChange}
        />

        <FilterPills mood={mood} onMoodChange={onMoodChange} />
      </div>
    </section>
  )
}
