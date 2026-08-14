import type { CatalogEvent } from "@/app/actions/public-events"
import { BOOST_TIER_RANK, type BoostTier } from "@/lib/boost-plans"
import { isPastEvent } from "@/lib/event-status"

/** Destacado activo solo si flag + fecha futura (expiración automática en consulta). */
export function isBoostActive(event: {
  isFeatured?: boolean | null
  featuredUntil?: string | null
}): boolean {
  if (!event.isFeatured || !event.featuredUntil) return false
  return new Date(event.featuredUntil).getTime() > Date.now()
}

/** Prioridad en home: auspicio Tokepass o boost pago activo. */
export function isHomePriority(event: {
  isFeatured?: boolean | null
  featuredUntil?: string | null
  isSponsoredByTokepass?: boolean | null
}): boolean {
  if (event.isSponsoredByTokepass) return true
  return isBoostActive(event)
}

export function compareFeaturedThenDate(a: CatalogEvent, b: CatalogEvent): number {
  const aPast = isPastEvent(a)
  const bPast = isPastEvent(b)
  if (aPast !== bPast) {
    return aPast ? 1 : -1
  }

  const aSponsored = Boolean(a.isSponsoredByTokepass)
  const bSponsored = Boolean(b.isSponsoredByTokepass)
  if (aSponsored !== bSponsored) {
    return aSponsored ? -1 : 1
  }

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
  return events.filter(isHomePriority).slice(0, limit)
}
