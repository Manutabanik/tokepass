import { purchaseCapForTier } from "@/lib/checkout-limits"
import { selectableTicketStock } from "@/lib/checkout/ticket-stock"
import { isLogicalGeneralSectorId } from "@/lib/seating/venue-map-pricing"

export type GeneralQuantityTier = {
  id: string
  available: number
  capacity?: number | null
  sold?: number | null
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
  const lotLeft = selectableTicketStock(input.tier)
  const sectorId = input.tier.seatingSectorId?.trim() || ""
  let sectorLeft = lotLeft
  if (isLogicalGeneralSectorId(sectorId)) {
    const inSector = input.siblings.filter(
      (tier) => (tier.seatingSectorId ?? "").trim() === sectorId,
    )
    const sectorAvailable = inSector.reduce(
      (sum, tier) => sum + selectableTicketStock(tier),
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
