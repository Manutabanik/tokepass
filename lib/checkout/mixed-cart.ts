import { isMappedCheckoutItem } from "@/lib/checkout/hybrid-cart"
import {
  layoutRequiresSeatSelection,
} from "@/lib/checkout/revalidate-seat-holds"
import type { CheckoutCartItem } from "@/lib/validations/checkout"

export type MixedCartTierHint = {
  id: string
  name?: string | null
  layoutType?: string | null
  seatingSectorId?: string | null
  hasMap?: boolean | null
  isNumbered?: boolean | null
}

function firstBoolean(
  ...values: Array<boolean | null | undefined>
): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value
  }
  return null
}

/** Numbered seats/tables. Map polygons of type Zona / Acceso general are not. */
export function tierIsNumbered(
  tier?: Pick<MixedCartTierHint, "layoutType" | "isNumbered"> | null,
): boolean {
  if (!tier) return false
  if (tier.isNumbered === true) return true
  if (tier.isNumbered === false) return false
  return layoutRequiresSeatSelection(tier.layoutType)
}

/** Stock comprable de un SKU general: capacity - sold. No usa el techo de recinto. */
export function generalTierRemaining(row: {
  capacity?: number | null
  sold?: number | null
}): number {
  const capacity = Math.max(0, Math.floor(Number(row.capacity)) || 0)
  const sold = Math.max(0, Math.floor(Number(row.sold)) || 0)
  return Math.max(0, capacity - sold)
}

export function tierUsesMapInventory(
  tier: Pick<
    MixedCartTierHint,
    "layoutType" | "seatingSectorId" | "hasMap" | "isNumbered"
  >,
  linkedSectorIds?: ReadonlySet<string>,
): boolean {
  if (!tierIsNumbered(tier)) return false
  if (tier.hasMap === false) return false
  if (tier.hasMap === true) return true
  if (layoutRequiresSeatSelection(tier.layoutType)) return true
  const sectorId = tier.seatingSectorId?.trim() ?? ""
  return sectorId.length > 0 && Boolean(linkedSectorIds?.has(sectorId))
}

export function partitionMixedCartItems<T extends CheckoutCartItem>(input: {
  items: T[]
  tiers?: readonly MixedCartTierHint[]
  linkedSectorIds?: ReadonlySet<string>
}): { mapItems: T[]; generalItems: T[] } {
  const tiers = new Map((input.tiers ?? []).map((tier) => [tier.id, tier]))
  const mapItems: T[] = []
  const generalItems: T[] = []

  for (const item of input.items) {
    const tierId = item.ticketTierId || item.ticket_tier_id || item.tierId
    const tier = tiers.get(tierId)
    const flaggedNumbered = firstBoolean(item.isNumbered, item.is_numbered)
    const numbered =
      flaggedNumbered ?? (tier != null ? tierIsNumbered(tier) : false)
    const mapped =
      isMappedCheckoutItem(item) ||
      (numbered &&
        tier != null &&
        tierUsesMapInventory(
          { ...tier, isNumbered: numbered },
          input.linkedSectorIds,
        ))
    if (mapped) mapItems.push(item)
    else generalItems.push(item)
  }

  return { mapItems, generalItems }
}
