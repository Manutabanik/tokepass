import { purchaseCapForLayout } from "@/lib/checkout-limits"
import { isLogicalGeneralSectorId } from "@/lib/seating/venue-map-pricing"

export type GeneralQuantityTier = {
  id: string
  available: number
  layoutType?: string | null
  seatingSectorId?: string | null
  capacityPerUnit?: number | null
}

export function generalTicketMaxQuantity(input: {
  tier: GeneralQuantityTier
  siblings: readonly GeneralQuantityTier[]
  quantities: Record<string, number>
  selectedCount: number
  maxTicketsPerUser?: number | null
}): number {
  const currentQty = Math.max(0, input.quantities[input.tier.id] ?? 0)
  const purchaseCap = purchaseCapForLayout(
    input.tier.layoutType,
    input.maxTicketsPerUser,
  )
  const otherSelected = Math.max(0, input.selectedCount - currentQty)
  const userLeft = Math.max(0, purchaseCap - otherSelected)
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
  return Math.max(0, Math.min(userLeft, lotLeft, sectorLeft))
}
