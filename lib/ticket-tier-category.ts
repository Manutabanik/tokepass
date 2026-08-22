import { publicTicketOfferKind } from "@/lib/checkout/ticket-offer-kind"

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
  tierType?: string | null
  bundleType?: string | null
  isFullPass?: boolean
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
  if (
    publicTicketOfferKind({
      name: input.name,
      dayId: input.dayId,
      layoutType: input.layoutType,
      tierType: input.tierType,
      bundleType: input.bundleType,
      isFullPass: input.isFullPass,
      comboItems: input.hasComboItems ? [{}] : [],
    }) !== "SINGLE_DAY"
  ) {
    return "bundle"
  }
  return "standard"
}

export function discountPercent(listPrice: number, salePrice: number): number {
  if (!(listPrice > 0) || salePrice >= listPrice) return 0
  return Math.round(((listPrice - salePrice) / listPrice) * 100)
}
