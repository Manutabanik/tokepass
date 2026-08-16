import type { Metadata } from "next"

import { CATALOG_PAGE_SIZE } from "@/lib/catalog/constants"
import { DiscoveryHub } from "@/components/discovery/discovery-hub"
import { AnimatedBackground } from "@/components/discovery/animated-background"
import {
  cachedActiveEventCategories,
  cachedFeaturedDiscoveryArtists,
  cachedPublishedEvents,
} from "@/lib/catalog/cached-public-reads"
import { mapDbCategoriesToDiscovery } from "@/lib/category-icons"
import { DEFAULT_DISCOVERY_CATEGORIES } from "@/lib/discovery-categories"

export const revalidate = 60

export const metadata: Metadata = {
  title: "Buscar eventos",
  description:
    "Buscá por artista, evento o lugar. Filtrá la cartelera de Tokepass y encontrá tu próxima noche.",
}

export default async function SearchEventsPage() {
  const [events, dbCategories, featuredArtists] = await Promise.all([
    cachedPublishedEvents(CATALOG_PAGE_SIZE).catch(() => []),
    cachedActiveEventCategories().catch(() => []),
    cachedFeaturedDiscoveryArtists().catch(() => []),
  ])
  const categories =
    dbCategories.length > 0
      ? mapDbCategoriesToDiscovery(dbCategories)
      : DEFAULT_DISCOVERY_CATEGORIES

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-x-clip bg-background text-foreground">
      <AnimatedBackground />

      <div className="relative mx-auto max-w-3xl px-0 pb-24 pt-2 sm:px-2 lg:pb-28">
        <DiscoveryHub
          variant="directory"
          events={events}
          featuredArtists={featuredArtists}
          categories={categories}
        />
      </div>
    </div>
  )
}
