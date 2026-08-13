import type { Metadata } from "next"

import { getActiveEventCategories } from "@/app/actions/categories"
import {
  getFeaturedEvents,
  getPublishedEvents,
} from "@/app/actions/public-events"
import { AnimatedBackground } from "@/components/discovery/animated-background"
import { DiscoveryHub } from "@/components/discovery/discovery-hub"
import { mapDbCategoriesToDiscovery } from "@/lib/category-icons"
import { DEFAULT_DISCOVERY_CATEGORIES } from "@/lib/discovery-categories"
import type { FeaturedRotationResult } from "@/lib/featured-rotation"

export const metadata: Metadata = {
  title: "Tokepass — Tu próxima gran noche",
  description:
    "Fiestas, festivales y las mejores noches de tu ciudad. Entradas digitales seguras que funcionan sin internet.",
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  let events: Awaited<ReturnType<typeof getPublishedEvents>> = []
  let featured: FeaturedRotationResult<
    Awaited<ReturnType<typeof getPublishedEvents>>[number]
  > = {
    events: [],
    pool: [],
    totalSponsored: 0,
  }
  let categories = DEFAULT_DISCOVERY_CATEGORIES
  let loadError: string | null = null

  try {
    const [published, featuredResult, dbCategories] = await Promise.all([
      getPublishedEvents(q),
      getFeaturedEvents(),
      getActiveEventCategories().catch(() => []),
    ])
    events = published
    featured = featuredResult
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
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-x-clip bg-[#f4f2f8] text-zinc-900 dark:bg-[#030712] dark:text-zinc-100">
      <AnimatedBackground />

      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-2 sm:px-6 lg:px-8 lg:pb-28">
        {loadError ? (
          <div className="mt-16 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-10 text-center text-sm text-red-700 dark:text-red-200">
            {loadError}
          </div>
        ) : (
          <DiscoveryHub
            events={events}
            initialQuery={q ?? ""}
            initialFeatured={featured}
            categories={categories}
          />
        )}
      </div>
    </div>
  )
}
