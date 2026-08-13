import { isHomePriority } from "@/lib/services/events-service"

export const FEATURED_CAROUSEL_LIMIT = 6

type FeaturedEligibleItem = {
  isSponsoredByTokepass: boolean
  isFeatured?: boolean | null
  featuredUntil?: string | null
  venueLocation?: string | null
  location: string
  venueName?: string | null
}

/** Fisher–Yates: equity de impresiones entre auspiciantes / boosts. */
export function fisherYatesShuffle<T>(items: T[]): T[] {
  const list = [...items]
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = list[i]!
    list[i] = list[j]!
    list[j] = tmp
  }
  return list
}

function provinceLabel(event: FeaturedEligibleItem): string {
  const raw = event.venueLocation ?? event.location
  return raw.split(",")[0]?.trim() || event.location
}

export function matchesFeaturedProvince(
  event: FeaturedEligibleItem,
  province?: string | null,
): boolean {
  const city = province?.trim().toLowerCase() ?? ""
  if (!city || city === "todas") return true
  const place =
    `${event.venueLocation ?? ""} ${event.location} ${event.venueName ?? ""} ${provinceLabel(event)}`.toLowerCase()
  return place.includes(city)
}

export function isFeaturedRailEligible(event: FeaturedEligibleItem): boolean {
  return isHomePriority(event)
}

export type FeaturedRotationResult<T = FeaturedEligibleItem> = {
  events: T[]
  totalSponsored: number
  pool: T[]
}

/**
 * Motor de rotación: auspicios Tokepass + boosts activos,
 * filtro de provincia, shuffle equitativo y tope de 6.
 */
export function rotateSponsoredEvents<T extends FeaturedEligibleItem>(
  events: T[],
  options?: {
    province?: string | null
    limit?: number
    alreadyShuffled?: boolean
  },
): FeaturedRotationResult<T> {
  const limit = options?.limit ?? FEATURED_CAROUSEL_LIMIT
  const eligible = events.filter(isFeaturedRailEligible)
  const filtered = eligible.filter((event) =>
    matchesFeaturedProvince(event, options?.province),
  )
  const pool = options?.alreadyShuffled
    ? filtered
    : fisherYatesShuffle(filtered)

  return {
    pool,
    totalSponsored: pool.length,
    events: pool.slice(0, limit),
  }
}
