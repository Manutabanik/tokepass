import type { CatalogEvent } from "@/app/actions/public-events"
import { BOOST_TIER_RANK, type BoostTier } from "@/lib/boost-plans"

/** Destacado activo solo si flag + fecha futura (expiración automática en consulta). */
export function isBoostActive(event: {
  isFeatured?: boolean | null
  featuredUntil?: string | null
}): boolean {
  if (!event.isFeatured || !event.featuredUntil) return false
  return new Date(event.featuredUntil).getTime() > Date.now()
}

export function compareFeaturedThenDate(a: CatalogEvent, b: CatalogEvent): number {
  const aActive = isBoostActive(a)
  const bActive = isBoostActive(b)

  if (aActive !== bActive) {
    return aActive ? -1 : 1
  }

  if (aActive && bActive) {
    const aRank =
      BOOST_TIER_RANK[(a.featuredTier as BoostTier | null) ?? "silver"] ?? 0
    const bRank =
      BOOST_TIER_RANK[(b.featuredTier as BoostTier | null) ?? "silver"] ?? 0
    if (aRank !== bRank) return bRank - aRank
  }

  return new Date(a.date).getTime() - new Date(b.date).getTime()
}

export function sortCatalogForHome(events: CatalogEvent[]): CatalogEvent[] {
  return [...events].sort(compareFeaturedThenDate)
}

export function pickFeaturedRail(
  events: CatalogEvent[],
  limit = 8,
): CatalogEvent[] {
  return events.filter(isBoostActive).slice(0, limit)
}
