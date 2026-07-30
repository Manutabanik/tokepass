import type { CatalogEvent } from "@/app/actions/public-events"

export type DiscoveryMoodId =
  | "all"
  | "tonight"
  | "cachengue"
  | "electronica"
  | "festivales"
  | "recitales"

export const DISCOVERY_MOODS: Array<{
  id: DiscoveryMoodId
  label: string
}> = [
  { id: "all", label: "Todos" },
  { id: "tonight", label: "Hoy se sale" },
  { id: "cachengue", label: "Cachengue & Previa" },
  { id: "electronica", label: "Electrónica & Beats" },
  { id: "festivales", label: "Festivales & Masivos" },
  { id: "recitales", label: "Recitales & Shows" },
]

const KEYWORDS: Record<
  Exclude<DiscoveryMoodId, "all" | "tonight">,
  string[]
> = {
  cachengue: [
    "cachengue",
    "reggaeton",
    "perreo",
    "cumbia",
    "trap",
    "previa",
    "after",
  ],
  electronica: [
    "electro",
    "electr",
    "techno",
    "house",
    "dj",
    "rave",
    "trance",
    "beats",
  ],
  festivales: ["festival", "fest", "open air", "al aire", "masivo"],
  recitales: [
    "recital",
    "show",
    "concierto",
    "live",
    "banda",
    "tour",
    "arena",
  ],
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

function matchesKeyword(event: CatalogEvent, keys: string[]): boolean {
  const haystack =
    `${event.title} ${event.description ?? ""} ${event.location}`.toLowerCase()
  return keys.some((key) => haystack.includes(key))
}

export function filterCatalogEvents(
  events: CatalogEvent[],
  options: {
    query?: string
    mood?: DiscoveryMoodId
    city?: string
  },
): CatalogEvent[] {
  const q = options.query?.trim().toLowerCase() ?? ""
  const city = options.city?.trim().toLowerCase() ?? ""
  const mood = options.mood ?? "all"

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

    if (mood === "all") return true
    if (mood === "tonight") return isTonight(event.date)
    return matchesKeyword(event, KEYWORDS[mood])
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
    .filter((event) => matchesKeyword(event, KEYWORDS.festivales))
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

export function urgencyLabel(event: CatalogEvent): string | null {
  if (event.soldRatio != null && event.soldRatio >= 0.85) {
    return "Agotando Preventa"
  }
  if (event.ticketsLeft != null && event.ticketsLeft > 0 && event.ticketsLeft <= 40) {
    return "Pocos Tickets"
  }
  if (event.soldRatio != null && event.soldRatio >= 0.6) {
    return "Agotando Preventa"
  }
  return null
}
