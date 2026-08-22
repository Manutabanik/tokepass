import { toCartNumber } from "@/lib/checkout/cart-lines"

export type TierPriceSource = {
  id: string
  price: number
  seatingSectorId?: string | null
}

/**
 * Unit prices keyed only by stable IDs.
 * Never index display names — two SKUs can share a label and overwrite each other.
 */
export function buildTierUnitPriceIndex(
  tiers: readonly TierPriceSource[],
): Record<string, number> {
  const prices: Record<string, number> = {}
  const sectorCounts = new Map<string, number>()

  for (const tier of tiers) {
    const sector = tier.seatingSectorId?.trim()
    if (sector) sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1)
  }

  for (const tier of tiers) {
    const id = tier.id.trim()
    const price = toCartNumber(tier.price)
    if (!id || !Number.isFinite(price) || price < 0) continue
    prices[id] = price
    const sector = tier.seatingSectorId?.trim()
    if (sector && sectorCounts.get(sector) === 1) {
      prices[sector] = price
    }
  }

  return prices
}

export function unitPriceForTierId(
  tierId: string | null | undefined,
  prices: Record<string, number>,
  fallback = 0,
): number {
  const id = tierId?.trim()
  if (id && Number.isFinite(prices[id])) return Number(prices[id])
  return Number.isFinite(fallback) ? Number(fallback) : 0
}
