import {
  cartLineAmount,
  cartLineQuantity,
  toCartNumber,
} from "@/lib/checkout/cart-lines"
import { centsToMoney, moneyToCents } from "@/lib/money/cents"
import { splitAbsorbFee } from "@/lib/pricing/absorb-fee-split"

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
  /** true = el organizador absorbe. false = se suma al comprador. */
  absorbFees?: boolean | null
}

export type CartPriceBreakdown = {
  /** Σ(ticketPrice × quantity). Precio ingresado. */
  ticketPrice: number
  /** Σ(price × quantity). Alias de ticketPrice. */
  subtotal: number
  /** Igual a ticketPrice: la entrada sin el cargo trasladado. */
  baseAmount: number
  /** Σ(feeAmount × quantity). */
  serviceFee: number
  feeAmount: number
  /** Σ(customerTotal × quantity). Total a pagar. */
  customerTotal: number
  grandTotal: number
  absorbFees: boolean
}

export type CartLineMoney = {
  /** Precio ingresado / catálogo por unidad. */
  price: number
  ticketPrice: number
  /** Entrada (ticketPrice) para el tooltip. */
  basePrice: number
  /** Cargo por unidad. */
  serviceFee: number
  feeAmount: number
  /** Total cobrado por unidad (`customerTotal`). */
  totalPrice: number
  customerTotal: number
  absorbFees: boolean
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

/**
 * Cargo Tokepass por línea. Si `absorbFees` es false, este monto se suma
 * al total del comprador. Si es true, solo se usa para el split contable.
 */
export function cartIncludedServiceFee(
  lines: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
  rate: unknown = 0,
  fixedFee: unknown = 0,
  absorbFees: boolean | null = false,
): number {
  return centsToMoney(
    (lines ?? []).reduce((sum, line) => {
      const unit = toCartNumber(line.price)
      const quantity = cartLineQuantity(line.quantity)
      if (unit <= 0 || quantity <= 0) return sum
      const split = splitAbsorbFee({
        ticketPrice: unit,
        feeRate: rate,
        absorbFees,
        fixedFee,
      })
      return sum + moneyToCents(split.feeAmount) * quantity
    }, 0),
  )
}

/** Split por unidad según absorb_fees. El cobro es `customerTotal`. */
export function cartLineUnitMoney(
  ticketPrice: unknown,
  rule: CartServiceFeeRule = {},
): CartLineMoney {
  const split = splitAbsorbFee({
    ticketPrice,
    feeRate: rule.rate,
    absorbFees: rule.absorbFees,
    fixedFee: rule.fixedFee,
  })
  return {
    price: split.ticketPrice,
    ticketPrice: split.ticketPrice,
    basePrice: split.ticketPrice,
    serviceFee: split.feeAmount,
    feeAmount: split.feeAmount,
    totalPrice: split.customerTotal,
    customerTotal: split.customerTotal,
    absorbFees: split.absorbFees,
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

function sumStampedField(
  lines: ReadonlyArray<{ quantity?: unknown } & CartLineMoney>,
  field: "ticketPrice" | "feeAmount" | "customerTotal",
): number {
  return centsToMoney(
    lines.reduce((sum, line) => {
      const quantity = cartLineQuantity(line.quantity)
      if (quantity <= 0) return sum
      return sum + moneyToCents(line[field]) * quantity
    }, 0),
  )
}

/**
 * Motor de precios del carrito. Recalcular en cada cambio de ítem o de tarifa.
 *
 * `ticket_tiers.price` es el precio ingresado (`ticketPrice`).
 * El comprador paga `customerTotal` / `grandTotal` según `absorb_fees`.
 */
export function calculateCartPriceBreakdown(
  items: ReadonlyArray<{ price?: unknown; quantity?: unknown }> | null | undefined,
  rule: CartServiceFeeRule = {},
): CartPriceBreakdown {
  const stamped = stampCartLinesMoney(items, rule)
  const ticketPrice = sumStampedField(stamped, "ticketPrice")
  const feeAmount = sumStampedField(stamped, "feeAmount")
  const customerTotal = sumStampedField(stamped, "customerTotal")
  const absorbFees = rule.absorbFees === true
  return {
    ticketPrice,
    subtotal: ticketPrice,
    baseAmount: ticketPrice,
    serviceFee: feeAmount,
    feeAmount,
    customerTotal,
    grandTotal: customerTotal,
    absorbFees,
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
