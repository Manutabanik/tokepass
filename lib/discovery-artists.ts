import { eventArtistsToLineup, parseEventLineup } from "@/lib/event-lineup"

export const FEATURED_DISCOVERY_ARTISTS_LIMIT = 6
/** Lista del acordeón de filtros (incluye destacados + resto del catálogo). */
export const DISCOVERY_FILTER_ARTISTS_LIMIT = 24

export type CatalogEventArtist = {
  id: string
  name: string
  imageUrl: string | null
}

export type FeaturedDiscoveryArtist = CatalogEventArtist & {
  activeEventCount: number
}

export function isMissingArtistSchema(message: string): boolean {
  return /artists|event_artists|schema cache|PGRST204|42703/i.test(message)
}

/** Safe token for PostgREST `or` / `ilike` filters. */
export function sanitizeCatalogSearch(query: string): string {
  return query.trim().replace(/[%_,.()\\]/g, "").slice(0, 120)
}

export function buildCatalogSearchOr(
  needle: string,
  artistEventIds: string[] = [],
): string {
  const term = `%${needle}%`
  const clauses = [
    `title.ilike.${term}`,
    `description.ilike.${term}`,
    `location.ilike.${term}`,
  ]
  const ids = artistEventIds.filter(Boolean)
  if (ids.length > 0) {
    clauses.push(`id.in.(${ids.join(",")})`)
  }
  return clauses.join(",")
}

function uniqueArtists(artists: CatalogEventArtist[]): CatalogEventArtist[] {
  const seen = new Set<string>()
  const out: CatalogEventArtist[] = []
  for (const artist of artists) {
    const id = artist.id?.trim()
    const name = artist.name?.trim()
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name,
      imageUrl: artist.imageUrl?.trim() || null,
    })
  }
  return out
}

/** Prefers `event_artists` join; falls back to JSON `events.lineup`. */
export function mapCatalogEventArtists(input: {
  eventArtists?: unknown
  lineupJson?: unknown
}): CatalogEventArtist[] {
  const fromJoin = eventArtistsToLineup(input.eventArtists).artists.map(
    (artist) => ({
      id: artist.id,
      name: artist.name,
      imageUrl: artist.imageUrl,
    }),
  )
  if (fromJoin.length > 0) return uniqueArtists(fromJoin)

  return uniqueArtists(
    parseEventLineup(input.lineupJson).artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      imageUrl: artist.imageUrl,
    })),
  )
}

export function rankFeaturedArtists(
  artists: CatalogEventArtist[],
  limit = FEATURED_DISCOVERY_ARTISTS_LIMIT,
): FeaturedDiscoveryArtist[] {
  const cap = Math.min(Math.max(limit, 1), 48)
  const counts = new Map<string, FeaturedDiscoveryArtist>()

  for (const artist of artists) {
    const id = artist.id?.trim()
    const name = artist.name?.trim()
    if (!id || !name) continue
    const current = counts.get(id)
    if (current) {
      current.activeEventCount += 1
      if (!current.imageUrl && artist.imageUrl) {
        current.imageUrl = artist.imageUrl
      }
      continue
    }
    counts.set(id, {
      id,
      name,
      imageUrl: artist.imageUrl ?? null,
      activeEventCount: 1,
    })
  }

  return [...counts.values()]
    .sort((left, right) => {
      if (right.activeEventCount !== left.activeEventCount) {
        return right.activeEventCount - left.activeEventCount
      }
      return left.name.localeCompare(right.name, "es")
    })
    .slice(0, cap)
}

export function rankFeaturedArtistsFromCatalog(
  events: Array<{ artists?: CatalogEventArtist[] }>,
  limit = FEATURED_DISCOVERY_ARTISTS_LIMIT,
): FeaturedDiscoveryArtist[] {
  return rankFeaturedArtists(
    events.flatMap((event) => event.artists ?? []),
    limit,
  )
}
