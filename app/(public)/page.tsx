import type { Metadata } from "next"

import {
  cachedActiveEventCategories,
  cachedActivePlatformSponsors,
  cachedFeaturedDiscoveryArtists,
  cachedFeaturedEvents,
  cachedPublishedEvents,
} from "@/lib/catalog/cached-public-reads"
import { CATALOG_PAGE_SIZE } from "@/lib/catalog/constants"
import { AnimatedBackground } from "@/components/discovery/animated-background"
import { DiscoveryHub } from "@/components/discovery/discovery-hub"
import { SponsorMarquee } from "@/components/public/sponsor-grid"
import { WebsiteSchemaScript } from "@/components/public/website-schema-script"
import { mapDbCategoriesToDiscovery } from "@/lib/category-icons"
import { DEFAULT_DISCOVERY_CATEGORIES } from "@/lib/discovery-categories"
import type { FeaturedRotationResult } from "@/lib/featured-rotation"
import type { CatalogEvent } from "@/app/actions/public-events"

export const revalidate = 60

export const metadata: Metadata = {
  title: "TokePass — Tu próxima gran experiencia",
  description:
    "Descubrí eventos, capacitaciones y espectáculos. Asegurá tu lugar presencial o virtual.",
}

export default async function HomePage() {
  let events: CatalogEvent[] = []
  let featured: FeaturedRotationResult<CatalogEvent> = {
    events: [],
    pool: [],
    totalSponsored: 0,
  }
  let categories = DEFAULT_DISCOVERY_CATEGORIES
  let platformSponsors: Awaited<
    ReturnType<typeof cachedActivePlatformSponsors>
  > = []
  let featuredArtists: Awaited<
    ReturnType<typeof cachedFeaturedDiscoveryArtists>
  > = []
  let loadError: string | null = null

  try {
    const [published, featuredResult, dbCategories, sponsors, discoveryArtists] =
      await Promise.all([
        cachedPublishedEvents(CATALOG_PAGE_SIZE),
        cachedFeaturedEvents(),
        cachedActiveEventCategories().catch(() => []),
        cachedActivePlatformSponsors().catch(() => []),
        cachedFeaturedDiscoveryArtists().catch(() => []),
      ])
    events = published
    featured = featuredResult
    featuredArtists = discoveryArtists
    platformSponsors = sponsors
    if (dbCategories.length > 0) {
      categories = mapDbCategoriesToDiscovery(dbCategories)
    }
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar los eventos."
  }

  return (
    <div className="relative isolate flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-hidden bg-background text-foreground">
      <WebsiteSchemaScript />
      <AnimatedBackground />

      <div className="relative mx-auto max-w-7xl px-4 pt-4 pb-24 sm:px-6 sm:pt-6 lg:px-8 lg:pb-28">
        {loadError ? (
          <div className="mt-16 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-10 text-center text-sm text-red-700 dark:text-red-200">
            {loadError}
          </div>
        ) : (
          <DiscoveryHub
            events={events}
            initialFeatured={featured}
            featuredArtists={featuredArtists}
            categories={categories}
          />
        )}
        {!loadError ? <SponsorMarquee sponsors={platformSponsors} /> : null}
      </div>
    </div>
  )
}
