import { unstable_cache } from "next/cache"
import { cache } from "react"

import {
  getEventAccessGate,
  getEventDetails,
  getFeaturedDiscoveryArtists,
  getFeaturedEvents,
  getPublishedEvents,
  getRelatedEvents,
} from "@/app/actions/public-events"
import { CATALOG_PAGE_SIZE } from "@/lib/catalog/constants"
import { getActiveEventCategories } from "@/app/actions/categories"
import { getActivePlatformSponsors } from "@/app/actions/platform-sponsors"
import { getActiveResaleListingsForEvent } from "@/app/actions/resale"
import { DISCOVERY_FILTER_ARTISTS_LIMIT } from "@/lib/discovery-artists"

/**
 * Cross-request Data Cache (60s) + per-request React cache().
 * Keys are primitives only — never pass mutable objects.
 */
export const cachedPublishedEvents = cache((limit = CATALOG_PAGE_SIZE) =>
  unstable_cache(
    () => getPublishedEvents(undefined, { limit }),
    ["catalog-published-events", String(limit)],
    { revalidate: 60 },
  )(),
)

export const cachedFeaturedEvents = cache(() =>
  unstable_cache(() => getFeaturedEvents(), ["catalog-featured-events"], {
    revalidate: 60,
  })(),
)

export const cachedFeaturedDiscoveryArtists = cache(() =>
  unstable_cache(
    () => getFeaturedDiscoveryArtists(DISCOVERY_FILTER_ARTISTS_LIMIT),
    ["catalog-featured-artists", String(DISCOVERY_FILTER_ARTISTS_LIMIT)],
    { revalidate: 60 },
  )(),
)

export const cachedActiveEventCategories = cache(() =>
  unstable_cache(
    () => getActiveEventCategories(),
    ["catalog-event-categories"],
    { revalidate: 60 },
  )(),
)

export const cachedActivePlatformSponsors = cache(() =>
  unstable_cache(
    () => getActivePlatformSponsors(),
    ["catalog-platform-sponsors"],
    { revalidate: 60 },
  )(),
)

export const cachedEventDetails = cache((slug: string) =>
  unstable_cache(
    () => getEventDetails(slug),
    ["event-details", slug],
    { revalidate: 30 },
  )(),
)

export const cachedEventAccessGate = cache((slug: string) =>
  unstable_cache(
    () => getEventAccessGate(slug),
    ["event-access-gate", slug],
    { revalidate: 30 },
  )(),
)

export const cachedRelatedEvents = cache(
  (currentEventId: string, category: string, province: string, limit: number) =>
    unstable_cache(
      () =>
        getRelatedEvents({
          currentEventId,
          category: category || null,
          province: province || null,
          limit,
        }),
      [
        "event-related",
        currentEventId,
        category,
        province,
        String(limit),
      ],
      { revalidate: 30 },
    )(),
)

export const cachedResaleListings = cache((eventId: string) =>
  unstable_cache(
    () => getActiveResaleListingsForEvent(eventId),
    ["event-resale", eventId],
    { revalidate: 30 },
  )(),
)
