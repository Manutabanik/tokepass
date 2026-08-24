import {
  cartLineAmount,
  cartLineQuantity,
  toCartNumber,
} from "@/lib/checkout/cart-lines"
import { centsToMoney, moneyToCents } from "@/lib/money/cents"

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

/**
 * Immutable cart total: stamped `price * quantity` only.
 * Gratis (`0`) stays `0` — never substitute a parent/category price.
 */
export function calculateTotal(
  items: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
): number {
  return (items ?? []).reduce((acc, item) => {
    const price = toCartNumber(item.price)
    const quantity = cartLineQuantity(item.quantity)
    return acc + price * quantity
  }, 0)
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
