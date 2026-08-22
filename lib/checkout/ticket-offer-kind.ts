import { isFullPassDayId } from "@/lib/event-schedule"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"

export const PUBLIC_TICKET_OFFER_KINDS = [
  "SINGLE_DAY",
  "COMBO",
  "PASS",
] as const

export type PublicTicketOfferKind = (typeof PUBLIC_TICKET_OFFER_KINDS)[number]

export type PublicTicketOfferInput = {
  name?: string | null
  dayId?: string | null
  dateId?: string | null
  isFullPass?: boolean
  tierType?: string | null
  layoutType?: string | null
  category?: string | null
  bundleType?: string | null
  bundleItems?: Array<unknown> | null
  comboItems?: Array<unknown> | null
}

const PASS_OR_COMBO_NAME =
  /\b(abono|combo|pack|pase|promo|promos|promoci[oó]n)\b/i

function inventoryType(ticket: PublicTicketOfferInput) {
  return inferInventoryTierType({
    tierType: ticket.tierType,
    layoutType: ticket.layoutType,
    category: ticket.category,
    bundleItems:
      ticket.comboItems && ticket.comboItems.length > 0
        ? [{ tierId: "combo", quantity: 1 }]
        : Array.isArray(ticket.bundleItems) && ticket.bundleItems.length > 0
          ? [{ tierId: "combo", quantity: 1 }]
          : null,
  })
}

/**
 * Clasifica la oferta pública por tipo real.
 * Las entradas comunes (aunque no tengan `day_id`) no se tratan como combo.
 */
export function publicTicketOfferKind(
  ticket: PublicTicketOfferInput,
): PublicTicketOfferKind {
  const bundleType = String(ticket.bundleType ?? "").trim()
  if (bundleType === "multi_day_pass") return "PASS"
  const type = inventoryType(ticket)
  if (type === "bundle") {
    return bundleType === "multi_day_pass" ? "PASS" : "COMBO"
  }
  if (ticket.isFullPass === true) return "PASS"
  const unbound = isFullPassDayId(ticket.dateId ?? ticket.dayId)
  if (unbound && PASS_OR_COMBO_NAME.test(ticket.name ?? "")) {
    return /combo|pack|promo/i.test(ticket.name ?? "") ? "COMBO" : "PASS"
  }
  return "SINGLE_DAY"
}

export function isComboOrPassOffer(ticket: PublicTicketOfferInput): boolean {
  return publicTicketOfferKind(ticket) !== "SINGLE_DAY"
}
