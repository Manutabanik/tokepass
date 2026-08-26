import { isComboOrPassOffer } from "@/lib/checkout/ticket-offer-kind"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"

export const TICKET_COMMERCE_TYPES = ["standard", "combo", "extra"] as const

export type TicketCommerceType = (typeof TICKET_COMMERCE_TYPES)[number]

export const TICKET_COMMERCE_TYPE_LABELS: Record<TicketCommerceType, string> = {
  standard: "General",
  combo: "Combo / Promoción",
  extra: "Extra / Adicional",
}

export function parseTicketCommerceType(
  value: unknown,
): TicketCommerceType | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (normalized === "standard" || normalized === "combo" || normalized === "extra") {
    return normalized
  }
  return null
}

export function asTicketCommerceType(
  value: unknown,
  fallback: TicketCommerceType = "standard",
): TicketCommerceType {
  return parseTicketCommerceType(value) ?? fallback
}

export type TicketCommerceSource = {
  ticketType?: string | null
  ticket_type?: string | null
  commerceType?: string | null
  commerce_type?: string | null
  name?: string | null
  dayId?: string | null
  dateId?: string | null
  isFullPass?: boolean
  tierType?: string | null
  tier_type?: string | null
  layoutType?: string | null
  layout_type?: string | null
  category?: string | null
  bundleType?: string | null
  bundle_type?: string | null
  comboItems?: Array<unknown> | null
}

export function resolveTicketCommerceType(
  ticket: TicketCommerceSource,
): TicketCommerceType {
  const explicit =
    parseTicketCommerceType(ticket.ticketType) ??
    parseTicketCommerceType(ticket.ticket_type) ??
    parseTicketCommerceType(ticket.commerceType) ??
    parseTicketCommerceType(ticket.commerce_type)
  if (explicit) return explicit

  const inventory = inferInventoryTierType({
    tierType: ticket.tierType ?? ticket.tier_type,
    layoutType: ticket.layoutType ?? ticket.layout_type,
    category: ticket.category,
    bundleItems:
      ticket.comboItems && ticket.comboItems.length > 0
        ? [{ tierId: "combo", quantity: 1 }]
        : null,
  })
  if (inventory === "addon" || ticket.category === "special") return "extra"
  if (
    inventory === "bundle" ||
    isComboOrPassOffer({
      name: ticket.name,
      dayId: ticket.dayId ?? ticket.dateId,
      dateId: ticket.dateId ?? ticket.dayId,
      isFullPass: ticket.isFullPass,
      tierType: ticket.tierType ?? ticket.tier_type,
      layoutType: ticket.layoutType ?? ticket.layout_type,
      category: ticket.category,
      bundleType: ticket.bundleType ?? ticket.bundle_type,
      comboItems: ticket.comboItems,
    })
  ) {
    return "combo"
  }
  return "standard"
}

export function partitionCheckoutTickets<T extends TicketCommerceSource>(
  tickets: readonly T[],
): {
  standardTickets: T[]
  comboTickets: T[]
  extraTickets: T[]
} {
  const standardTickets: T[] = []
  const comboTickets: T[] = []
  const extraTickets: T[] = []
  for (const ticket of tickets) {
    const kind = resolveTicketCommerceType(ticket)
    if (kind === "extra") extraTickets.push(ticket)
    else if (kind === "combo") comboTickets.push(ticket)
    else standardTickets.push(ticket)
  }
  return { standardTickets, comboTickets, extraTickets }
}
