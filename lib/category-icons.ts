import {
  Clapperboard,
  Disc3,
  Mic2,
  Music,
  PartyPopper,
  Sparkles,
  Theater,
  Trophy,
  Users,
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
  users: Users,
  partypopper: PartyPopper,
  party: PartyPopper,
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
      icon: (row.iconName?.trim().toLowerCase() ||
        "sparkles") as DiscoveryCategory["icon"],
      iconName: row.iconName,
    })),
  ]
}
