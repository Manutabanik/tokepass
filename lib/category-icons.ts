import {
  Clapperboard,
  Disc3,
  Mic2,
  Music,
  PartyPopper,
  Sparkles,
  Star,
  Theater,
  Ticket,
  Trophy,
  Users,
  GraduationCap,
  type LucideIcon,
} from "lucide-react"

import type { DiscoveryCategory } from "@/lib/discovery-categories"

export type EventCategoryOption = {
  id: string
  name: string
  slug: string
  iconName: string | null
}

/**
 * Mapa icon_name (DB / Lucide) → componente.
 * Claves normalizadas a lowercase sin espacios.
 */
export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  disc3: Disc3,
  disc: Disc3,
  mic2: Mic2,
  mic: Mic2,
  microphone: Mic2,
  clapperboard: Clapperboard,
  theater: Theater,
  masks: Theater,
  trophy: Trophy,
  music: Music,
  ticket: Ticket,
  star: Star,
  users: Users,
  partypopper: PartyPopper,
  party: PartyPopper,
  graduationcap: GraduationCap,
  graduation: GraduationCap,
}

export const CATEGORY_ICON_OPTIONS = [
  { name: "sparkles", label: "Destacado" },
  { name: "mic2", label: "Micrófono" },
  { name: "disc3", label: "Disco" },
  { name: "music", label: "Música" },
  { name: "clapperboard", label: "Cine" },
  { name: "theater", label: "Teatro" },
  { name: "trophy", label: "Premio" },
  { name: "ticket", label: "Entrada" },
  { name: "star", label: "Estrella" },
  { name: "users", label: "Comunidad" },
  { name: "graduationcap", label: "Cursos" },
] as const

const ICON_ALIASES: Record<string, string> = {
  disc: "disc3",
  mic: "mic2",
  microphone: "mic2",
  masks: "theater",
  party: "partypopper",
}

export function normalizeCategoryIconName(
  iconName: string | null | undefined,
): string {
  if (!iconName?.trim()) return "sparkles"
  const key = iconName.trim().toLowerCase().replace(/[\s_-]+/g, "")
  const canonical = ICON_ALIASES[key] ?? key
  if (CATEGORY_ICON_OPTIONS.some((option) => option.name === canonical)) {
    return canonical
  }
  return CATEGORY_ICON_MAP[canonical] ? canonical : "sparkles"
}

export function getCategoryIconPickerOptions(currentName?: string | null) {
  const selected = currentName?.trim()
    ? normalizeCategoryIconName(currentName)
    : "sparkles"
  const options: { name: string; label: string }[] = CATEGORY_ICON_OPTIONS.map(
    (option) => ({
      name: option.name,
      label: option.label,
    }),
  )
  if (!options.some((option) => option.name === selected)) {
    options.push({ name: selected, label: selected })
  }
  return options
}

export function resolveCategoryIcon(
  iconName: string | null | undefined,
): LucideIcon {
  if (!iconName) return Sparkles
  const key = iconName.trim().toLowerCase().replace(/[\s_-]+/g, "")
  return (
    CATEGORY_ICON_MAP[key] ??
    CATEGORY_ICON_MAP[iconName.trim().toLowerCase()] ??
    Sparkles
  )
}

/** Prefijo sintético "Todos" + filas DB → DiscoveryCategory[] para el Hero. */
export function mapDbCategoriesToDiscovery(
  rows: EventCategoryOption[],
): DiscoveryCategory[] {
  const all: DiscoveryCategory = {
    id: "all",
    label: "Todos",
    icon: "sparkles",
    iconName: "sparkles",
  }

  return [
    all,
    ...rows.map((row) => ({
      id: row.id,
      label: row.name,
      slug: row.slug,
      icon: (row.iconName?.trim().toLowerCase() ||
        "sparkles") as DiscoveryCategory["icon"],
      iconName: row.iconName,
    })),
  ]
}
