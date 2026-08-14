export const TICKET_TIER_CATEGORIES = [
  "standard",
  "bundle",
  "special",
] as const

export type TicketTierCategory = (typeof TICKET_TIER_CATEGORIES)[number]

export const TICKET_TIER_CATEGORY_LABELS: Record<TicketTierCategory, string> = {
  standard: "Entrada individual",
  bundle: "Pack / combo / abono",
  special: "Tarifa especial",
}

export function parseTicketTierCategory(raw: unknown): TicketTierCategory {
  const value = String(raw ?? "").trim()
  if ((TICKET_TIER_CATEGORIES as readonly string[]).includes(value)) {
    return value as TicketTierCategory
  }
  return "standard"
}

export function inferTicketTierCategory(input: {
  category?: string | null
  name: string
  dayId?: string | null
  layoutType?: string | null
  hasComboItems?: boolean
  isMultiDay?: boolean
}): TicketTierCategory {
  const parsed = parseTicketTierCategory(input.category)
  if (parsed !== "standard") return parsed

  const name = input.name.toLocaleLowerCase("es")
  if (
    /(jubilad|pcd|discapacidad|estudiante|mayor|cud|senior)/i.test(name)
  ) {
    return "special"
  }
  if (input.hasComboItems) return "bundle"
  if (input.layoutType === "table_combo") return "bundle"
  if (input.isMultiDay && !input.dayId) return "bundle"
  return "standard"
}

export function discountPercent(listPrice: number, salePrice: number): number {
  if (!(listPrice > 0) || salePrice >= listPrice) return 0
  return Math.round(((listPrice - salePrice) / listPrice) * 100)
}
