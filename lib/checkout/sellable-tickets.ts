import { isValidPublicPrice } from "@/lib/checkout/public-price"
import { customerFacingUnitPrice } from "@/lib/pricing/absorb-fee-split"
import {
  resolveTicketCommerceType,
  type TicketCommerceSource,
} from "@/lib/events/ticket-commerce-type"
import {
  isTicketOnSale,
  resolveTicketSaleState,
} from "@/lib/inventory/ticket-sale-window"

export type SellableTicketInput = TicketCommerceSource & {
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

export const EXTRAS_REQUIRE_ADMISSION_ERROR =
  "Sumá una entrada para poder comprar extras."

export function cartIncludesAdmissionSku(
  tiers: readonly TicketCommerceSource[],
): boolean {
  return tiers.some((tier) => resolveTicketCommerceType(tier) !== "extra")
}

export const CHECKOUT_TIERS_UNREADABLE_ERROR =
  "No se pudieron leer las entradas. Probá de nuevo."

/** Fail closed: missing rows must not skip the extras-only rule. */
export function assertCartHasAdmissionSku(
  cartItemCount: number,
  tiers: readonly TicketCommerceSource[] | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (cartItemCount <= 0) return { ok: true }
  const rows = tiers ?? []
  if (rows.length === 0) {
    return { ok: false, error: CHECKOUT_TIERS_UNREADABLE_ERROR }
  }
  if (!cartIncludesAdmissionSku(rows)) {
    return { ok: false, error: EXTRAS_REQUIRE_ADMISSION_ERROR }
  }
  return { ok: true }
}

/** Fail closed: a missing cart SKU must not skip extras or seat rules. */
export function assertLoadedCheckoutTiersCoverCart(
  requestedTierIds: readonly string[],
  tiers: ReadonlyArray<{ id?: string | null }> | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (requestedTierIds.length === 0) return { ok: true }
  const loaded = new Set(
    (tiers ?? [])
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean),
  )
  if (requestedTierIds.some((id) => !loaded.has(id))) {
    return { ok: false, error: CHECKOUT_TIERS_UNREADABLE_ERROR }
  }
  return { ok: true }
}

/** Admission SKU: public, on sale, with remaining stock. Extras are excluded. */
export function isAdmissionTicket(ticket: SellableTicketInput): boolean {
  return resolveTicketCommerceType({
    ...ticket,
    comboItems:
      ticket.comboItems ??
      (Array.isArray(ticket.bundleItems) && ticket.bundleItems.length > 0
        ? ticket.bundleItems
        : null),
  }) !== "extra"
}

export function isSellablePublicTicket(
  ticket: SellableTicketInput,
  now?: Date,
): boolean {
  if ((ticket.visibility ?? "public") === "private") return false
  if (!isSellableTicketActive(ticket)) return false
  if (!isAdmissionTicket(ticket)) return false
  if (!isValidPublicPrice(ticket.price)) return false
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

export type StartingPriceFeeRule = {
  rate?: unknown
  fixedFee?: unknown
  absorbFees?: boolean | null
}

export function startingPriceFromSellable(
  tickets: readonly SellableTicketInput[] | null | undefined,
  now?: Date,
  feeRule?: StartingPriceFeeRule | null,
): number | null {
  const prices = sellablePublicTickets(tickets, now).map((ticket) =>
    feeRule
      ? customerFacingUnitPrice(ticket.price, feeRule)
      : Number(ticket.price),
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
