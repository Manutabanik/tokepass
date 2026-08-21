import type { CatalogEvent } from "@/app/actions/public-events"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import { findCategory } from "@/lib/discovery-categories"
import { isOnlineDelivery } from "@/lib/events/delivery-mode"

export const DISCOVERY_NICHE_IDS = [
  "all",
  "entertainment",
  "courses",
  "sports",
] as const

export type DiscoveryNicheId = (typeof DISCOVERY_NICHE_IDS)[number]

export const DISCOVERY_NICHES: Array<{
  id: DiscoveryNicheId
  label: string
}> = [
  { id: "all", label: "Todos" },
  { id: "entertainment", label: "Entretenimiento" },
  { id: "courses", label: "Cursos & Negocios" },
  { id: "sports", label: "Deportes" },
]

const ENTERTAINMENT_SLUGS = new Set([
  "fiestas",
  "recitales",
  "teatro",
  "teatro-y-cultura",
])
const COURSE_SLUGS = new Set([
  "cursos",
  "cursos-negocios",
  "capacitaciones",
  "webinars",
  "negocios",
])
const SPORTS_SLUGS = new Set(["deportes"])

const COURSE_KEYS = [
  "curso",
  "webinar",
  "capacitacion",
  "capacitación",
  "masterclass",
  "training",
  "negocio",
]
const SPORTS_KEYS = [
  "deporte",
  "futbol",
  "fútbol",
  "partido",
  "basquet",
  "tenis",
  "running",
]

export function parseDiscoveryNiche(value?: string | null): DiscoveryNicheId {
  if (
    value === "entertainment" ||
    value === "courses" ||
    value === "sports"
  ) {
    return value
  }
  return "all"
}

function categorySlug(
  event: Pick<CatalogEvent, "categoryId">,
  categories: DiscoveryCategory[],
): string {
  const id = event.categoryId?.trim() ?? ""
  if (!id) return ""
  const category = findCategory(categories, id)
  return (category?.slug ?? category?.id ?? "").trim().toLowerCase()
}

function categoryLabel(
  event: Pick<CatalogEvent, "categoryId">,
  categories: DiscoveryCategory[],
): string {
  const id = event.categoryId?.trim() ?? ""
  if (!id) return ""
  return (findCategory(categories, id)?.label ?? "").trim().toLowerCase()
}

function titleHaystack(event: Pick<CatalogEvent, "title" | "description">) {
  return `${event.title} ${event.description ?? ""}`.toLowerCase()
}

function isSportsEvent(
  event: CatalogEvent,
  categories: DiscoveryCategory[],
): boolean {
  const slug = categorySlug(event, categories)
  if (SPORTS_SLUGS.has(slug)) return true
  const label = categoryLabel(event, categories)
  if (label.includes("deporte")) return true
  return SPORTS_KEYS.some((key) => titleHaystack(event).includes(key))
}

function isCourseEvent(
  event: CatalogEvent,
  categories: DiscoveryCategory[],
): boolean {
  const slug = categorySlug(event, categories)
  if (ENTERTAINMENT_SLUGS.has(slug) || SPORTS_SLUGS.has(slug)) return false
  if (COURSE_SLUGS.has(slug)) return true
  const label = categoryLabel(event, categories)
  if (
    label.includes("curso") ||
    label.includes("negocio") ||
    label.includes("webinar")
  ) {
    return true
  }
  if (COURSE_KEYS.some((key) => titleHaystack(event).includes(key))) return true
  return isOnlineDelivery(event.deliveryMode) && !isSportsEvent(event, categories)
}

function isEntertainmentEvent(
  event: CatalogEvent,
  categories: DiscoveryCategory[],
): boolean {
  if (isSportsEvent(event, categories) || isCourseEvent(event, categories)) {
    return false
  }
  const slug = categorySlug(event, categories)
  if (ENTERTAINMENT_SLUGS.has(slug)) return true
  return !event.categoryId
}

export function eventMatchesNiche(
  event: CatalogEvent,
  niche: DiscoveryNicheId,
  categories: DiscoveryCategory[],
): boolean {
  if (niche === "all") return true
  if (niche === "sports") return isSportsEvent(event, categories)
  if (niche === "courses") return isCourseEvent(event, categories)
  return isEntertainmentEvent(event, categories)
}
