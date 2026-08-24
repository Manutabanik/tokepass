import { toCartNumber } from "@/lib/checkout/cart-lines"
import { isValidPublicPrice } from "@/lib/checkout/public-price"

export type TierPriceSource = {
  id: string
  price: number
  seatingSectorId?: string | null
}

/**
 * Unit prices keyed only by stable IDs.
 * Ticket ids always win. A seating sector must never overwrite another SKU.
 */
export function buildTierUnitPriceIndex(
  tiers: readonly TierPriceSource[],
): Record<string, number> {
  const ticketPrices: Record<string, number> = {}
  const sectorPrices: Record<string, number> = {}
  const ticketIds = new Set<string>()
  const sectorCounts = new Map<string, number>()

  for (const tier of tiers) {
    const id = tier.id.trim()
    if (id) ticketIds.add(id)
    const sector = tier.seatingSectorId?.trim()
    if (sector) sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1)
  }

  for (const tier of tiers) {
    const id = tier.id.trim()
    const price = toCartNumber(tier.price)
    if (!id || !isValidPublicPrice(price)) continue
    ticketPrices[id] = price
    const sector = tier.seatingSectorId?.trim()
    if (
      sector &&
      sectorCounts.get(sector) === 1 &&
      !ticketIds.has(sector)
    ) {
      sectorPrices[sector] = price
    }
  }

  return { ...sectorPrices, ...ticketPrices }
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
