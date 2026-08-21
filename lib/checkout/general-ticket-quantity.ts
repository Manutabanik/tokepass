import { purchaseCapForTier } from "@/lib/checkout-limits"
import { isLogicalGeneralSectorId } from "@/lib/seating/venue-map-pricing"

export type GeneralQuantityTier = {
  id: string
  available: number
  layoutType?: string | null
  seatingSectorId?: string | null
  capacityPerUnit?: number | null
  minPurchaseLimit?: number | null
  maxPurchaseLimit?: number | null
}

export function generalTicketMaxQuantity(input: {
  tier: GeneralQuantityTier
  siblings: readonly GeneralQuantityTier[]
  quantities: Record<string, number>
  selectedCount: number
  maxTicketsPerUser?: number | null
}): number {
  const purchaseCap = purchaseCapForTier({
    layoutType: input.tier.layoutType,
    maxPurchaseLimit: input.tier.maxPurchaseLimit,
    fallbackMax: input.maxTicketsPerUser,
  })
  const lotLeft = Math.max(0, Math.floor(Number(input.tier.available)) || 0)
  const sectorId = input.tier.seatingSectorId?.trim() || ""
  let sectorLeft = lotLeft
  if (isLogicalGeneralSectorId(sectorId)) {
    const inSector = input.siblings.filter(
      (tier) => (tier.seatingSectorId ?? "").trim() === sectorId,
    )
    const sectorAvailable = inSector.reduce(
      (sum, tier) => sum + Math.max(0, Math.floor(Number(tier.available)) || 0),
      0,
    )
    const otherQty = inSector.reduce(
      (sum, tier) =>
        sum + (tier.id === input.tier.id ? 0 : (input.quantities[tier.id] ?? 0)),
      0,
    )
    sectorLeft = Math.max(0, sectorAvailable - otherQty)
  }
  return Math.max(0, Math.min(purchaseCap, lotLeft, sectorLeft))
}
