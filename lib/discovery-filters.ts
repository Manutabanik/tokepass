import type { CatalogEvent } from "@/app/actions/public-events"
import {
  categoryKeywords,
  DEFAULT_DISCOVERY_CATEGORIES,
  findCategory,
  type DiscoveryCategory,
  type DiscoveryMoodId,
} from "@/lib/discovery-categories"
import { isPastEvent } from "@/lib/event-status"
import { publicEventPath } from "@/lib/seo/site"

export type { DiscoveryMoodId, DiscoveryCategory }
export {
  DEFAULT_DISCOVERY_CATEGORIES,
  DISCOVERY_MOODS,
  findCategory,
} from "@/lib/discovery-categories"

export type DiscoveryDatePreset = "all" | "today" | "weekend" | "week" | "month"

export const DISCOVERY_DATE_PRESETS: Array<{
  id: DiscoveryDatePreset
  label: string
}> = [
  { id: "all", label: "Todas las fechas" },
  { id: "today", label: "Hoy" },
  { id: "weekend", label: "Este fin de semana" },
  { id: "week", label: "Próximos 7 días" },
  { id: "month", label: "Este mes" },
]

export function datePresetLabel(preset?: string | null): string {
  return (
    DISCOVERY_DATE_PRESETS.find((item) => item.id === preset)?.label ??
    DISCOVERY_DATE_PRESETS[0].label
  )
}

export function parseDatePreset(value?: string | null): DiscoveryDatePreset {
  if (
    value === "today" ||
    value === "weekend" ||
    value === "week" ||
    value === "month"
  ) {
    return value
  }
  return "all"
}

export type ExploreCatalogQuery = {
  q?: string | null
  location?: string | null
  category?: string | null
  artist?: string | null
  when?: string | null
}

/** Query string de la cartelera en Inicio (`q`, `location`, `category`, `artist`, `when`). */
export function catalogSearchParams(
  params: ExploreCatalogQuery = {},
): URLSearchParams {
  const qs = new URLSearchParams()
  const q = params.q?.trim() ?? ""
  const location = params.location?.trim() ?? ""
  const category = params.category?.trim() ?? ""
  const artist = params.artist?.trim() ?? ""
  const when = parseDatePreset(params.when)
  if (q) qs.set("q", q)
  if (location && location !== "todas") qs.set("location", location)
  if (category && category !== "all") qs.set("category", category)
  if (artist) qs.set("artist", artist)
  if (when !== "all") qs.set("when", when)
  return qs
}

export function exploreCatalogPath(params: ExploreCatalogQuery = {}): string {
  const encoded = catalogSearchParams(params).toString()
  return encoded ? `/?${encoded}` : "/"
}

export function catalogFiltersFromSearchParams(params: {
  get(name: string): string | null
}): {
  query: string
  location: string
  categoryId: string
  artistId: string
  datePreset: DiscoveryDatePreset
} {
  return {
    query: params.get("q")?.trim() ?? "",
    location: params.get("location")?.trim() || "todas",
    categoryId: params.get("category")?.trim() || "all",
    artistId: params.get("artist")?.trim() || "",
    datePreset: parseDatePreset(params.get("when")),
  }
}

const ARGENTINA_TZ = "America/Argentina/Buenos_Aires"

function ymdInArgentina(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value)
}

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day + days))
  return utc.toISOString().slice(0, 10)
}

function weekdayMondayFirst(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number)
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return utcDay === 0 ? 6 : utcDay - 1
}

export function matchesDatePreset(
  dateIso: string,
  preset: DiscoveryDatePreset = "all",
  now = new Date(),
): boolean {
  if (preset === "all") return true
  const eventDay = ymdInArgentina(new Date(dateIso))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDay)) return false
  const today = ymdInArgentina(now)

  if (preset === "today") return eventDay === today
  if (preset === "week") {
    return eventDay >= today && eventDay <= addDaysYmd(today, 6)
  }
  if (preset === "month") {
    return eventDay.slice(0, 7) === today.slice(0, 7) && eventDay >= today
  }

  const mondayOffset = weekdayMondayFirst(today)
  const thisMonday = addDaysYmd(today, -mondayOffset)
  const friday = addDaysYmd(thisMonday, 4)
  const sunday = addDaysYmd(thisMonday, 6)
  if (today <= sunday) {
    return eventDay >= friday && eventDay <= sunday
  }
  const nextFriday = addDaysYmd(friday, 7)
  return eventDay >= nextFriday && eventDay <= addDaysYmd(nextFriday, 2)
}

export function eventPlaceHaystack(event: CatalogEvent): string {
  return `${event.venueLocation ?? ""} ${event.location} ${event.venueName ?? ""}`.toLowerCase()
}

export function matchesProvince(event: CatalogEvent, province: string): boolean {
  const needle = province.trim().toLowerCase()
  if (!needle || needle === "todas") return true
  const place = eventPlaceHaystack(event)
  if (needle.includes("ciudad autónoma") || needle === "caba") {
    return /caba|capital federal|ciudad aut[oó]noma/.test(place)
  }
  return place.includes(needle)
}

export function provinceChipLabel(name: string): string {
  const lower = name.trim().toLowerCase()
  if (lower.includes("ciudad autónoma")) return "CABA"
  if (lower.startsWith("tierra del fuego")) return "Tierra del Fuego"
  return name
}

export type DiscoveryFilterDraft = {
  query: string
  categoryId: string
  tagId: string | null
  city: string
  artistId: string
  datePreset: DiscoveryDatePreset
}

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

function catalogSearchHaystack(event: CatalogEvent): string {
  const artistNames = (event.artists ?? []).map((artist) => artist.name).join(" ")
  return `${event.title} ${event.description ?? ""} ${event.location} ${event.organizerName ?? ""} ${event.venueName ?? ""} ${artistNames}`.toLowerCase()
}

function matchesKeyword(event: CatalogEvent, keys: string[]): boolean {
  return keys.some((key) => catalogSearchHaystack(event).includes(key))
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
    /** UUID de artista (`event_artists.artist_id`). */
    artistId?: string | null
    datePreset?: DiscoveryDatePreset
    now?: Date
    categories?: DiscoveryCategory[]
  },
): CatalogEvent[] {
  const q = options.query?.trim().toLowerCase() ?? ""
  const artistId = options.artistId?.trim() ?? ""
  const datePreset = options.datePreset ?? "all"
  const categoryId = options.categoryId ?? options.mood ?? "all"
  const categories = options.categories ?? DEFAULT_DISCOVERY_CATEGORIES
  const category = findCategory(categories, categoryId)

  return events.filter((event) => {
    if (artistId) {
      const inLineup = (event.artists ?? []).some(
        (artist) => artist.id === artistId,
      )
      if (!inLineup) return false
    }

    if (q && !catalogSearchHaystack(event).includes(q)) return false

    if (!matchesProvince(event, options.city ?? "")) return false

    if (!matchesDatePreset(event.date, datePreset, options.now)) return false

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
  if (isPastEvent(event)) return null
  if (event.ticketsLeft != null && event.ticketsLeft <= 0) return null
  if (event.soldRatio != null && event.soldRatio >= 1) return null
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
      ...(event.artists ?? []).map((artist) => artist.name),
    ]
    const hit = fields.some((field) => field.toLowerCase().includes(q))
    if (!hit || seen.has(event.id)) continue
    seen.add(event.id)
    out.push({
      id: event.id,
      label: event.title,
      href: publicEventPath(event),
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
