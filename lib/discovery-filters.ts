import type { CatalogEvent } from "@/app/actions/public-events"
import {
  categoryKeywords,
  DEFAULT_DISCOVERY_CATEGORIES,
  findCategory,
  type DiscoveryCategory,
  type DiscoveryMoodId,
} from "@/lib/discovery-categories"

export type { DiscoveryMoodId, DiscoveryCategory }
export {
  DEFAULT_DISCOVERY_CATEGORIES,
  DISCOVERY_MOODS,
  findCategory,
} from "@/lib/discovery-categories"

/** Eventos de hoy (00:00 → 23:59:59 local). */
export function isTonight(dateIso: string): boolean {
  const date = new Date(dateIso)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function isThisWeekend(dateIso: string): boolean {
  const date = new Date(dateIso)
  const now = new Date()
  const day = now.getDay()
  const diffToSaturday = (6 - day + 7) % 7
  const saturday = new Date(now)
  saturday.setHours(0, 0, 0, 0)
  saturday.setDate(now.getDate() + diffToSaturday)
  const monday = new Date(saturday)
  monday.setDate(saturday.getDate() + 2)
  monday.setHours(23, 59, 59, 999)
  return date >= saturday && date <= monday
}

function matchesKeyword(event: CatalogEvent, keys: string[]): boolean {
  const haystack =
    `${event.title} ${event.description ?? ""} ${event.location}`.toLowerCase()
  return keys.some((key) => haystack.includes(key))
}

export function filterCatalogEvents(
  events: CatalogEvent[],
  options: {
    query?: string
    /** @deprecated Prefer `categoryId`. */
    mood?: DiscoveryMoodId | string
    categoryId?: string
    tagId?: string | null
    city?: string
    categories?: DiscoveryCategory[]
  },
): CatalogEvent[] {
  const q = options.query?.trim().toLowerCase() ?? ""
  const city = options.city?.trim().toLowerCase() ?? ""
  const categoryId = options.categoryId ?? options.mood ?? "all"
  const categories = options.categories ?? DEFAULT_DISCOVERY_CATEGORIES
  const category = findCategory(categories, categoryId)

  return events.filter((event) => {
    if (q) {
      const haystack =
        `${event.title} ${event.description ?? ""} ${event.location} ${event.organizerName ?? ""} ${event.venueName ?? ""}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }

    if (city && city !== "todas") {
      const place =
        `${event.venueLocation ?? ""} ${event.location} ${event.venueName ?? ""}`.toLowerCase()
      if (!place.includes(city)) return false
    }

    if (!category || category.id === "all") return true

    // Match exacto por FK de taxonomía (preferido).
    if (event.categoryId) {
      return event.categoryId === category.id
    }

    // Fallback heurístico solo si el evento aún no tiene category_id.
    const keys = categoryKeywords(category, options.tagId)
    if (keys.length === 0) return false
    return matchesKeyword(event, keys)
  })
}

export function pickTopSellers(events: CatalogEvent[], limit = 8): CatalogEvent[] {
  return [...events]
    .sort((a, b) => (b.soldRatio ?? 0) - (a.soldRatio ?? 0))
    .slice(0, limit)
}

export function pickWeekend(events: CatalogEvent[], limit = 8): CatalogEvent[] {
  return events.filter((event) => isThisWeekend(event.date)).slice(0, limit)
}

export function pickTonight(events: CatalogEvent[], limit = 8): CatalogEvent[] {
  return events.filter((event) => isTonight(event.date)).slice(0, limit)
}

export function pickFestivals(events: CatalogEvent[], limit = 8): CatalogEvent[] {
  return events
    .filter((event) =>
      matchesKeyword(event, ["festival", "fest", "open air", "al aire", "masivo"]),
    )
    .slice(0, limit)
}

export function pickUpcoming(events: CatalogEvent[], limit = 8): CatalogEvent[] {
  return [...events]
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    .slice(0, limit)
}

export function extractCities(events: CatalogEvent[]): string[] {
  const set = new Set<string>()
  for (const event of events) {
    const raw = event.venueLocation ?? event.location
    const city = raw.split(",")[0]?.trim()
    if (city) set.add(city)
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"))
}

export function eventCityLabel(event: CatalogEvent): string {
  const raw = event.venueLocation ?? event.location
  return raw.split(",")[0]?.trim() || event.location
}

export type EventBadgeKind = "urgency" | "live" | "featured" | "sponsored"

export function urgencyLabel(event: CatalogEvent): string | null {
  if (event.soldRatio != null && event.soldRatio >= 0.85) {
    return "Últimas entradas"
  }
  if (event.ticketsLeft != null && event.ticketsLeft > 0 && event.ticketsLeft <= 40) {
    return "Últimas entradas"
  }
  if (event.soldRatio != null && event.soldRatio >= 0.6) {
    return "Últimas entradas"
  }
  return null
}

export function eventSecondaryBadge(event: CatalogEvent): string | null {
  const haystack =
    `${event.title} ${event.description ?? ""}`.toLowerCase()
  if (
    ["live", "en vivo", "recital", "concierto", "banda", "dj"].some((k) =>
      haystack.includes(k),
    )
  ) {
    return "Música en vivo"
  }
  return null
}

/** Autocomplete suggestions from catalog (title, artist/organizer, place). */
export function buildSearchSuggestions(
  events: CatalogEvent[],
  query: string,
  limit = 8,
): Array<{ id: string; label: string; href: string; meta: string }> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const seen = new Set<string>()
  const out: Array<{ id: string; label: string; href: string; meta: string }> =
    []

  for (const event of events) {
    const fields = [
      event.title,
      event.organizerName ?? "",
      event.venueName ?? "",
      eventCityLabel(event),
    ]
    const hit = fields.some((field) => field.toLowerCase().includes(q))
    if (!hit || seen.has(event.id)) continue
    seen.add(event.id)
    out.push({
      id: event.id,
      label: event.title,
      href: `/events/${event.id}`,
      meta: [formatSuggestionMeta(event)].filter(Boolean).join(" · "),
    })
    if (out.length >= limit) break
  }

  return out
}

function formatSuggestionMeta(event: CatalogEvent): string {
  const parts = [
    event.organizerName,
    event.venueName ?? eventCityLabel(event),
  ].filter(Boolean)
  return parts.join(" · ")
}
