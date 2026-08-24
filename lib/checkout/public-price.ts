import {
  resolveSalePhases,
  type PublicTicketPhase,
} from "@/lib/inventory/active-phase"

/** Public All-In price. `0` (Gratis) is valid and must never be treated as missing. */
export function isValidPublicPrice(price: unknown): price is number {
  if (price === undefined || price === null) return false
  const amount = typeof price === "number" ? price : Number(price)
  return Number.isFinite(amount) && amount >= 0
}

export function firstValidPublicPrice(
  ...values: Array<number | null | undefined>
): number {
  for (const value of values) {
    if (value === undefined || value === null) continue
    const amount = Number(value)
    if (Number.isFinite(amount) && amount >= 0) return amount
  }
  return 0
}

/** Unit price shown on the ticket card. Cart and summary must reuse this value. */
export function publicOfferPrice(tier: {
  price: unknown
  phases?: PublicTicketPhase[]
}): number {
  const current = resolveSalePhases(tier.phases).current
  return firstValidPublicPrice(current?.price, Number(tier.price))
}

export function skuUnitPriceFromTiers(
  tierId: string | null | undefined,
  tiers: readonly {
    id: string
    price: unknown
    phases?: PublicTicketPhase[]
  }[],
  fallback: unknown = 0,
): number {
  const id = tierId?.trim()
  if (id) {
    const tier = tiers.find((item) => item.id === id)
    if (tier) return publicOfferPrice(tier)
  }
  return firstValidPublicPrice(Number(fallback))
}

/**
 * Price already resolved on a map/cart item.
 * A stamped `0` (Gratis) must never be replaced by a parent SKU.
 */
export function mapSelectionUnitPrice(
  stamped: unknown,
  tierId?: string | null,
  tiers: readonly {
    id: string
    price: unknown
    phases?: PublicTicketPhase[]
  }[] = [],
): number {
  if (stamped === undefined || stamped === null) {
    return skuUnitPriceFromTiers(tierId, tiers, 0)
  }
  const amount = typeof stamped === "number" ? stamped : Number(stamped)
  if (isValidPublicPrice(amount)) return amount
  return skuUnitPriceFromTiers(tierId, tiers, stamped)
}
