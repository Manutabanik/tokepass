import {
  calculateCartPriceBreakdown,
  cartLineQuantity,
  quoteCartLineCharges,
  type CartLineChargeQuote,
  type CartPriceBreakdown,
  type CartServiceFeeRule,
} from "@/lib/checkout/cart"
import { amountsMatch } from "@/lib/checkout/hybrid-cart"
import { displayedTotalMatchesServer } from "@/lib/checkout/price-guard"
import { centsToMoney, moneyToCents } from "@/lib/money/cents"

function sumLineQuoteFinalPrices(quotes: readonly CartLineChargeQuote[]) {
  return centsToMoney(
    quotes.reduce((sum, line) => {
      const quantity = cartLineQuantity(line.quantity)
      if (quantity <= 0) return sum
      return sum + moneyToCents(line.finalPrice) * quantity
    }, 0),
  )
}

export type CheckoutMoneyQuote = CartPriceBreakdown & {
  /** Σ precio ingresado. Se persiste en `orders.subtotal`. */
  ticketAmount: number
  /** Alias de `grandTotal` / `customerTotal`. */
  total: number
  lineQuotes: CartLineChargeQuote[]
}

export type ClientCheckoutMoney = {
  displayedTotal?: number | null
  subtotal?: number | null
  serviceFee?: number | null
  grandTotal?: number | null
  ticketPrice?: number | null
  feeAmount?: number | null
  customerTotal?: number | null
  lineQuotes?: CartLineChargeQuote[] | null
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
    lineQuotes: quoteCartLineCharges(lines, rule),
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
 * El persist TS nunca puede bajar `total_amount` por debajo del piso SQL
 * (`reserve_unified_cart_tx` deja all-in = subtotal).
 */
export function resolvePersistedFeeLedger(
  current: OrderMoneyLedger,
  quoted: OrderMoneyLedger,
): OrderMoneyLedger {
  if (moneyToCents(quoted.total_amount) < moneyToCents(current.total_amount)) {
    return current
  }
  return quoted
}

/**
 * Si el quote pide más que la fila persistida (absorb=false y persist falló),
 * crear la preferencia MP cobraria de menos. Hay que abortar el checkout.
 */
export function checkoutPreferenceUndersellsQuote(input: {
  databaseTotal: number
  quotedCustomerTotal: number
  promoApplied?: boolean
}): boolean {
  if (input.promoApplied) return false
  return (
    moneyToCents(input.quotedCustomerTotal) > moneyToCents(input.databaseTotal)
  )
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
  if (client.lineQuotes && client.lineQuotes.length > 0) {
    if (
      !amountsMatch(
        sumLineQuoteFinalPrices(client.lineQuotes),
        server.customerTotal,
      )
    ) {
      return false
    }
  }
  return true
}
