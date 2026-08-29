import {
  calculateCartPriceBreakdown,
  type CartPriceBreakdown,
  type CartServiceFeeRule,
} from "@/lib/checkout/cart"
import { amountsMatch } from "@/lib/checkout/hybrid-cart"
import { displayedTotalMatchesServer } from "@/lib/checkout/price-guard"

export type CheckoutMoneyQuote = CartPriceBreakdown & {
  /** Σ precio ingresado. Se persiste en `orders.subtotal`. */
  ticketAmount: number
  /** Alias de `grandTotal` / `customerTotal`. */
  total: number
}

export type ClientCheckoutMoney = {
  displayedTotal?: number | null
  subtotal?: number | null
  serviceFee?: number | null
  grandTotal?: number | null
  ticketPrice?: number | null
  feeAmount?: number | null
  customerTotal?: number | null
}

export type OrderMoneyLedger = {
  /** Precio ingresado (ticketPrice). */
  subtotal: number
  /** feeAmount. */
  service_charge: number
  /** customerTotal cobrado al comprador. */
  total_amount: number
}

export function quoteCheckoutMoney(
  lines: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
  rule: CartServiceFeeRule = {},
): CheckoutMoneyQuote {
  const quote = calculateCartPriceBreakdown(lines, rule)
  return {
    ...quote,
    ticketAmount: quote.ticketPrice,
    total: quote.customerTotal,
  }
}

export function orderLedgerFromQuote(quote: CheckoutMoneyQuote): OrderMoneyLedger {
  return {
    subtotal: quote.ticketPrice,
    service_charge: quote.feeAmount,
    total_amount: quote.customerTotal,
  }
}

/**
 * El cliente no fija el cobro: solo se compara contra el quote del servidor.
 * Con cupón se saltea el total pre-promo; el total final se valida después.
 */
export function clientCheckoutMoneyMatchesQuoted(
  client: ClientCheckoutMoney,
  server: CheckoutMoneyQuote,
  options?: { skipPrePromoTotal?: boolean },
): boolean {
  if (options?.skipPrePromoTotal) return true

  const grand =
    client.customerTotal ?? client.grandTotal ?? client.displayedTotal
  if (!displayedTotalMatchesServer(grand, server.customerTotal)) return false
  const ticketPrice = client.ticketPrice ?? client.subtotal
  if (
    ticketPrice != null &&
    !displayedTotalMatchesServer(ticketPrice, server.ticketPrice)
  ) {
    return false
  }
  const fee = client.feeAmount ?? client.serviceFee
  if (fee != null && !amountsMatch(fee, server.feeAmount)) {
    return false
  }
  return true
}
