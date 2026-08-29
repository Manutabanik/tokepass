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
  /** Σ(price × quantity). Precio público All-In. */
  subtotal: number
  /** Σ(base extraída). `subtotal - serviceFee`. */
  baseAmount: number
  /** Cargo Tokepass incluido (porcentaje + fijo). No se factura aparte. */
  serviceFee: number
  /** Monto cobrado. En All-In es igual al subtotal público. */
  grandTotal: number
}

export type CartLineMoney = {
  /** Precio público All-In por unidad. */
  price: number
  /** Entrada base extraída por unidad. */
  basePrice: number
  /** Comisión extraída por unidad. */
  serviceFee: number
  /** Total cobrado por unidad. All-In: igual a `price`. */
  totalPrice: number
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
  fixedFee: unknown = 0,
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

/** Split All-In de una unidad: base + fee = precio público. */
export function cartLineUnitMoney(
  publicPrice: unknown,
  rule: CartServiceFeeRule = {},
): CartLineMoney {
  const price = toCartNumber(publicPrice)
  if (price <= 0) {
    return { price: 0, basePrice: 0, serviceFee: 0, totalPrice: 0 }
  }
  const split = allInBreakdown(
    price,
    asServiceRate(rule.rate ?? 0),
    toCartNumber(rule.fixedFee),
  )
  return {
    price,
    basePrice: split.basePrice,
    serviceFee: split.platformFee,
    totalPrice: price,
  }
}

export function stampCartLineMoney<
  T extends { price?: unknown; quantity?: unknown },
>(line: T, rule: CartServiceFeeRule = {}): T & CartLineMoney {
  return { ...line, ...cartLineUnitMoney(line.price, rule) }
}

export function stampCartLinesMoney<
  T extends { price?: unknown; quantity?: unknown },
>(
  lines: readonly T[] | null | undefined,
  rule: CartServiceFeeRule = {},
): Array<T & CartLineMoney> {
  return (lines ?? []).map((line) => stampCartLineMoney(line, rule))
}

/**
 * Motor de precios del carrito. Recalcular en cada cambio de ítem o de tarifa.
 *
 * All-In: `ticket_tiers.price` ya incluye el service fee del evento
 * (`platform_fee_percentage` + `platform_fixed_fee`). El comprador paga
 * `grandTotal === subtotal`. `serviceFee` es el split interno / UI.
 * `itemTotalPrice = itemBasePrice + itemFee` sin sumar la fee otra vez
 * encima del precio público.
 */
export function calculateCartPriceBreakdown(
  items: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
  rule: CartServiceFeeRule = {},
): CartPriceBreakdown {
  const stamped = stampCartLinesMoney(items, rule)
  const subtotal = sumCartAmounts(stamped)
  const serviceFee = Math.min(
    subtotal,
    centsToMoney(
      stamped.reduce((sum, line) => {
        const quantity = cartLineQuantity(line.quantity)
        if (quantity <= 0 || line.serviceFee <= 0) return sum
        return sum + moneyToCents(line.serviceFee) * quantity
      }, 0),
    ),
  )
  const baseAmount = centsToMoney(
    Math.max(0, moneyToCents(subtotal) - moneyToCents(serviceFee)),
  )
  return {
    subtotal,
    baseAmount,
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
