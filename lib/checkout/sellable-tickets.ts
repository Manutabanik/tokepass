import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import {
  isTicketOnSale,
  resolveTicketSaleState,
} from "@/lib/inventory/ticket-sale-window"

export type SellableTicketInput = {
  price?: number | null
  available?: number | null
  stock_available?: number | null
  stockAvailable?: number | null
  capacity?: number | null
  sold?: number | null
  visibility?: string | null
  status?: string | null
  isActive?: boolean | null
  is_active?: boolean | null
  saleStartsAt?: string | Date | null
  saleEndsAt?: string | Date | null
  sale_starts_at?: string | Date | null
  sale_ends_at?: string | Date | null
  category?: string | null
  tierType?: string | null
  tier_type?: string | null
  layoutType?: string | null
  layout_type?: string | null
  bundleItems?: Array<unknown> | null
}

function sellableAvailable(ticket: SellableTicketInput): number | null | undefined {
  if (ticket.stock_available != null) return ticket.stock_available
  if (ticket.stockAvailable != null) return ticket.stockAvailable
  return ticket.available
}

function isSellableTicketActive(ticket: SellableTicketInput): boolean {
  if (ticket.isActive === false || ticket.is_active === false) return false
  const status = ticket.status?.trim()
  if (!status) return true
  return status.toUpperCase() === "ACTIVE"
}

/** Admission SKU: public, on sale, with remaining stock. Add-ons are excluded. */
export function isAdmissionTicket(ticket: SellableTicketInput): boolean {
  const type = inferInventoryTierType({
    tierType: ticket.tierType ?? ticket.tier_type,
    layoutType: ticket.layoutType ?? ticket.layout_type,
    category: ticket.category,
    bundleItems:
      Array.isArray(ticket.bundleItems) && ticket.bundleItems.length > 0
        ? [{ tierId: "combo", quantity: 1 }]
        : null,
  })
  return type !== "addon"
}

export function isSellablePublicTicket(
  ticket: SellableTicketInput,
  now?: Date,
): boolean {
  if ((ticket.visibility ?? "public") === "private") return false
  if (!isSellableTicketActive(ticket)) return false
  if (!isAdmissionTicket(ticket)) return false
  const price = Number(ticket.price)
  if (!Number.isFinite(price) || price < 0) return false
  return isTicketOnSale(
    resolveTicketSaleState({
      available: sellableAvailable(ticket),
      capacity: ticket.capacity,
      sold: ticket.sold,
      saleStartsAt: ticket.saleStartsAt ?? ticket.sale_starts_at,
      saleEndsAt: ticket.saleEndsAt ?? ticket.sale_ends_at,
      now,
    }),
  )
}

export function sellablePublicTickets<T extends SellableTicketInput>(
  tickets: readonly T[] | null | undefined,
  now?: Date,
): T[] {
  return (tickets ?? []).filter((ticket) => isSellablePublicTicket(ticket, now))
}

export function startingPriceFromSellable(
  tickets: readonly SellableTicketInput[] | null | undefined,
  now?: Date,
): number | null {
  const prices = sellablePublicTickets(tickets, now).map((ticket) =>
    Number(ticket.price),
  )
  if (prices.length === 0) return null
  return Math.min(...prices)
}

export function hasSellablePublicTickets(
  tickets: readonly SellableTicketInput[] | null | undefined,
  now?: Date,
): boolean {
  return (tickets ?? []).some((ticket) => isSellablePublicTicket(ticket, now))
}
