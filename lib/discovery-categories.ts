/**
 * Categorías / etiquetas de discovery B2C.
 * Preferí `getActiveEventCategories()` + `mapDbCategoriesToDiscovery`.
 * `DEFAULT_DISCOVERY_CATEGORIES` queda como fallback offline / migración no aplicada.
 */

export type DiscoveryCategoryIcon =
  | "sparkles"
  | "disc3"
  | "mic2"
  | "clapperboard"
  | "trophy"
  | "music"
  | "users"
  | (string & {})

export type DiscoverySubTag = {
  id: string
  label: string
  keywords?: string[]
}

export type DiscoveryCategory = {
  id: string
  label: string
  icon: DiscoveryCategoryIcon
  /** Nombre Lucide crudo desde DB (prioridad sobre `icon`). */
  iconName?: string | null
  /** @deprecated Preferí match exacto por `CatalogEvent.categoryId`. */
  keywords?: string[]
  tags?: DiscoverySubTag[]
}

/** Fallback local si la tabla aún no existe / falla el fetch. */
export const DEFAULT_DISCOVERY_CATEGORIES: DiscoveryCategory[] = [
  { id: "all", label: "Todos", icon: "sparkles" },
  {
    id: "fiestas",
    label: "Fiestas",
    icon: "disc3",
    iconName: "disc3",
    keywords: [
      "fiesta",
      "party",
      "boliche",
      "disco",
      "cachengue",
      "reggaeton",
      "perreo",
      "cumbia",
      "trap",
      "previa",
      "after",
      "electro",
      "electr",
      "techno",
      "house",
      "dj",
      "rave",
      "trance",
      "beats",
      "festival",
      "fest",
    ],
  },
  {
    id: "recitales",
    label: "Recitales",
    icon: "mic2",
    iconName: "mic2",
    keywords: [
      "recital",
      "show",
      "concierto",
      "live",
      "banda",
      "tour",
      "arena",
      "musica",
      "música",
    ],
  },
  {
    id: "teatro",
    label: "Teatro & Cultura",
    icon: "clapperboard",
    iconName: "clapperboard",
    keywords: [
      "teatro",
      "obra",
      "cultura",
      "stand up",
      "standup",
      "comedia",
      "danza",
      "ballet",
      "cine",
      "musical",
    ],
  },
  {
    id: "deportes",
    label: "Deportes",
    icon: "trophy",
    iconName: "trophy",
    keywords: [
      "deporte",
      "futbol",
      "fútbol",
      "partido",
      "basquet",
      "básquet",
      "tenis",
      "running",
      "maratón",
      "maraton",
      "boxeo",
      "mma",
      "carrera",
    ],
  },
]

export type DiscoveryMoodId =
  | "all"
  | "fiestas"
  | "recitales"
  | "teatro"
  | "deportes"

export const DISCOVERY_MOODS = DEFAULT_DISCOVERY_CATEGORIES.map((c) => ({
  id: c.id as DiscoveryMoodId,
  label: c.label,
}))

export function findCategory(
  categories: DiscoveryCategory[],
  id: string,
): DiscoveryCategory | undefined {
  return categories.find((c) => c.id === id)
}

export function categoryKeywords(
  category: DiscoveryCategory,
  tagId?: string | null,
): string[] {
  if (tagId && category.tags?.length) {
    const tag = category.tags.find((t) => t.id === tagId)
    if (tag?.keywords?.length) return tag.keywords
  }
  return category.keywords ?? []
}
