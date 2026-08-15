import type { Metadata } from "next"

import { getActiveEventCategories } from "@/app/actions/categories"
import {
  getFeaturedDiscoveryArtists,
  getPublishedEvents,
} from "@/app/actions/public-events"
import { AnimatedBackground } from "@/components/discovery/animated-background"
import { DiscoveryHub } from "@/components/discovery/discovery-hub"
import { mapDbCategoriesToDiscovery } from "@/lib/category-icons"
import { DEFAULT_DISCOVERY_CATEGORIES } from "@/lib/discovery-categories"
import { DISCOVERY_FILTER_ARTISTS_LIMIT } from "@/lib/discovery-artists"

export const metadata: Metadata = {
  title: "Eventos",
  description:
    "Descubrí fiestas, recitales y noches en Tokepass. Filtrá por categoría y conseguí tu entrada.",
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    location?: string
    category?: string
    artist?: string
    when?: string
  }>
}) {
  const { q, location, category, artist, when } = await searchParams
  const artistId = artist?.trim() || ""
  const [events, dbCategories, featuredArtists] = await Promise.all([
    getPublishedEvents().catch(() => []),
    getActiveEventCategories().catch(() => []),
    getFeaturedDiscoveryArtists(DISCOVERY_FILTER_ARTISTS_LIMIT).catch(() => []),
  ])
  const categories =
    dbCategories.length > 0
      ? mapDbCategoriesToDiscovery(dbCategories)
      : DEFAULT_DISCOVERY_CATEGORIES

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-x-clip bg-slate-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <AnimatedBackground />

      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pb-28 lg:pt-10">
        <DiscoveryHub
          events={events}
          initialQuery={q ?? ""}
          initialLocation={location?.trim() || "todas"}
          initialCategoryId={category?.trim() || "all"}
          initialArtistId={artistId}
          initialDatePreset={when}
          featuredArtists={featuredArtists}
          categories={categories}
        />
      </div>
    </div>
  )
}
