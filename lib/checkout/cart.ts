import {
  cartLineAmount,
  cartLineQuantity,
  toCartNumber,
} from "@/lib/checkout/cart-lines"
import { centsToMoney, moneyToCents } from "@/lib/money/cents"
import { allInBreakdown } from "@/lib/pricing/all-in"

export { cartLineQuantity, toCartNumber } from "@/lib/checkout/cart-lines"

/** Sums `item.quantity` across lines. Never use `cart.length` for ticket counts. */
export function sumCartQuantities(
  lines: ReadonlyArray<{ quantity?: unknown }> | null | undefined,
): number {
  return (lines ?? []).reduce(
    (acc, line) => acc + cartLineQuantity(line.quantity),
    0,
  )
}

export type CartServiceFeeRule = {
  /** Fracción (0.08) o puntos (8 = 8%). */
  rate?: unknown
  /** Cargo fijo ARS por entrada paga. */
  fixedFee?: unknown
}

export type CartPriceBreakdown = {
  /** Σ(price × quantity) en centavos. Precio público All-In. */
  subtotal: number
  /** Cargo Tokepass incluido (porcentaje + fijo). No se factura aparte. */
  serviceFee: number
  /** Monto cobrado. En All-In es igual al subtotal público. */
  grandTotal: number
}

/**
 * Immutable cart total: stamped `price * quantity` only, rounded in cents.
 * Gratis (`0`) stays `0` — never substitute a parent/category price.
 */
export function calculateTotal(
  items: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
): number {
  return sumCartAmounts(items)
}

export function sumCartAmounts(
  lines: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
): number {
  return centsToMoney(
    (lines ?? []).reduce((sum, line) => {
      return (
        sum +
        moneyToCents(
          cartLineAmount({
            price: toCartNumber(line.price),
            quantity: cartLineQuantity(line.quantity),
          }),
        )
      )
    }, 0),
  )
}

/**
 * Service fee on a subtotal. `rate` is 0.10 or 10 (10%).
 * All-In public prices already include this — do not add it on top of the total.
 */
export function includedServiceFee(subtotal: unknown, rate: unknown = 0.1): number {
  const base = toCartNumber(subtotal)
  const rawRate = toCartNumber(rate)
  const safeRate = rawRate > 1 ? rawRate / 100 : Math.max(0, rawRate)
  if (base <= 0 || safeRate <= 0) return 0
  return centsToMoney(Math.round(moneyToCents(base) * safeRate))
}

function asServiceRate(rate: unknown): number {
  const raw = toCartNumber(rate)
  return raw > 1 ? raw / 100 : Math.max(0, raw)
}

/**
 * Comisión TokePass ya incluida en precios All-In.
 * No sumar este valor al total cobrado: total = subtotal público.
 */
export function cartIncludedServiceFee(
  lines: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
  rate: unknown = 0,
  fixedFee = 0,
): number {
  const safeRate = asServiceRate(rate)
  const perTicketFixed = toCartNumber(fixedFee)
  return centsToMoney(
    (lines ?? []).reduce((sum, line) => {
      const unit = toCartNumber(line.price)
      const quantity = cartLineQuantity(line.quantity)
      if (unit <= 0 || quantity <= 0) return sum
      const { platformFee } = allInBreakdown(unit, safeRate, perTicketFixed)
      return sum + moneyToCents(platformFee) * quantity
    }, 0),
  )
}

/**
 * Motor de precios del carrito. Recalcular en cada cambio de ítem o de tarifa.
 *
 * All-In: `ticket_tiers.price` ya incluye el service fee del evento
 * (`platform_fee_percentage` + `platform_fixed_fee`). El comprador paga
 * `grandTotal === subtotal`. `serviceFee` es el split interno / UI.
 */
export function calculateCartPriceBreakdown(
  items: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
  rule: CartServiceFeeRule = {},
): CartPriceBreakdown {
  const subtotal = sumCartAmounts(items)
  const rawFee = cartIncludedServiceFee(items, rule.rate ?? 0, rule.fixedFee ?? 0)
  const serviceFee = Math.min(subtotal, rawFee)
  return {
    subtotal,
    serviceFee,
    grandTotal: subtotal,
  }
}

/** Counts selected tickets. $0 / Gratis quantities still count. */
export function cartQuantityCount(
  quantities?: Record<string, number> | null,
): number {
  return Object.values(quantities ?? {}).reduce((sum, value) => {
    const qty = cartLineQuantity(value)
    if (qty <= 0) return sum
    return sum + qty
  }, 0)
}

export function cartItemCount(
  quantities: Record<string, number>,
  hasNumberedSeat: boolean,
): number {
  return cartQuantityCount(quantities) + (hasNumberedSeat ? 1 : 0)
}

export function hasActiveCheckoutSelection(
  quantities: Record<string, number>,
  hasNumberedSeat: boolean,
): boolean {
  return cartItemCount(quantities, hasNumberedSeat) > 0
}
