import {
  calculateCartPriceBreakdown,
  type CartPriceBreakdown,
  type CartServiceFeeRule,
} from "@/lib/checkout/cart"
import { amountsMatch } from "@/lib/checkout/hybrid-cart"
import { displayedTotalMatchesServer } from "@/lib/checkout/price-guard"
import { centsToMoney, moneyToCents } from "@/lib/money/cents"

export type CheckoutMoneyQuote = CartPriceBreakdown & {
  /** Precio neto de entradas (público All-In menos comisión). */
  ticketAmount: number
  /** Comisión Tokepass extraída. Se persiste en `orders.service_charge`. */
  feeAmount: number
  /** Alias de `grandTotal` para el quote histórico. */
  total: number
}

export type ClientCheckoutMoney = {
  displayedTotal?: number | null
  subtotal?: number | null
  serviceFee?: number | null
  grandTotal?: number | null
}

export type OrderMoneyLedger = {
  /** Merchandise público All-In. */
  subtotal: number
  /** fee_amount contable. */
  service_charge: number
  /** Monto cobrado. All-In: igual al subtotal. */
  total_amount: number
}

export function quoteCheckoutMoney(
  lines: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
  rule: CartServiceFeeRule = {},
): CheckoutMoneyQuote {
  const quote = calculateCartPriceBreakdown(lines, rule)
  const ticketAmount = centsToMoney(
    Math.max(0, moneyToCents(quote.subtotal) - moneyToCents(quote.serviceFee)),
  )
  return {
    ...quote,
    ticketAmount,
    feeAmount: quote.serviceFee,
    total: quote.grandTotal,
  }
}

export function orderLedgerFromQuote(quote: CheckoutMoneyQuote): OrderMoneyLedger {
  return {
    subtotal: quote.subtotal,
    service_charge: quote.feeAmount,
    total_amount: quote.grandTotal,
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

  const grand = client.grandTotal ?? client.displayedTotal
  if (!displayedTotalMatchesServer(grand, server.grandTotal)) return false
  if (
    client.subtotal != null &&
    !displayedTotalMatchesServer(client.subtotal, server.subtotal)
  ) {
    return false
  }
  if (client.serviceFee != null && !amountsMatch(client.serviceFee, server.serviceFee)) {
    return false
  }
  return true
}
