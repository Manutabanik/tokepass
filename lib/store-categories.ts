import {
  Beer,
  Shirt,
  Sparkles,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react"

export const EVENT_ITEM_CATEGORIES = [
  "drinks",
  "food",
  "merch",
  "services",
  "upgrades",
] as const

export type EventItemCategory = (typeof EVENT_ITEM_CATEGORIES)[number]

export const EVENT_ITEM_CATEGORY_LABELS: Record<EventItemCategory, string> = {
  drinks: "Bebidas",
  food: "Comida",
  merch: "Merch",
  services: "Servicios",
  upgrades: "Upgrades",
}

export const EVENT_ITEM_CATEGORY_ICONS: Record<EventItemCategory, LucideIcon> = {
  drinks: Beer,
  food: UtensilsCrossed,
  merch: Shirt,
  services: Wrench,
  upgrades: Sparkles,
}

export function parseEventItemCategory(raw: unknown): EventItemCategory {
  const value = String(raw ?? "").trim()
  if ((EVENT_ITEM_CATEGORIES as readonly string[]).includes(value)) {
    return value as EventItemCategory
  }
  return "drinks"
}
