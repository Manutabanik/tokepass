/**
 * Techo público: el catálogo nunca anuncia más unidades que el aforo
 * físico del recinto en esa jornada.
 *
 * available = MIN(sku.capacity - sku.sold, venue.max_capacity_per_day - occupied_day)
 */

export type PublicStockTier = {
  id?: string
  capacity: number
  sold: number
  day_id?: string | null
  visibility?: string | null
  tier_type?: string | null
  layout_type?: string | null
  capacity_per_unit?: number | null
}

function asInt(value: unknown): number {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

export function isFullPassDayId(dayId: string | null | undefined): boolean {
  const raw = dayId == null ? "" : String(dayId).trim()
  return raw === ""
}

export function occupiesVenuePublicStock(tier: PublicStockTier): boolean {
  if ((tier.visibility ?? "public") === "private") return false
  const type = (tier.tier_type ?? "general").trim()
  return type !== "addon" && type !== "bundle"
}

export function venuePeoplePerSoldUnit(tier: PublicStockTier): number {
  if ((tier.layout_type ?? "").trim() === "table_combo") {
    return Math.max(1, asInt(tier.capacity_per_unit) || 1)
  }
  return 1
}

export function venuePeopleOccupied(tier: PublicStockTier): number {
  return Math.max(0, asInt(tier.sold)) * venuePeoplePerSoldUnit(tier)
}

export function skuRemaining(tier: Pick<PublicStockTier, "capacity" | "sold">): number {
  return Math.max(0, asInt(tier.capacity) - asInt(tier.sold))
}

export function occupiedVenueUnitsForDay(
  tiers: readonly PublicStockTier[],
  dayId: string | null | undefined,
): number {
  return tiers.reduce((sum, tier) => {
    if (!occupiesVenuePublicStock(tier)) return sum
    const people = venuePeopleOccupied(tier)
    if (isFullPassDayId(tier.day_id)) return sum + people
    if (isFullPassDayId(dayId)) return sum + people
    if (String(tier.day_id) === String(dayId)) return sum + people
    return sum
  }, 0)
}

export function venueRemainingForDay(input: {
  venueCapacity: number | null | undefined
  tiers: readonly PublicStockTier[]
  dayId: string | null | undefined
}): number {
  const cap = asInt(input.venueCapacity)
  if (cap <= 0) return Number.POSITIVE_INFINITY
  if (isFullPassDayId(input.dayId)) {
    const days = [
      ...new Set(
        input.tiers
          .map((tier) => tier.day_id)
          .filter((id): id is string => Boolean(id && String(id).trim())),
      ),
    ]
    if (days.length === 0) {
      return Math.max(0, cap - occupiedVenueUnitsForDay(input.tiers, null))
    }
    return Math.min(
      ...days.map((day) =>
        Math.max(0, cap - occupiedVenueUnitsForDay(input.tiers, day)),
      ),
    )
  }
  return Math.max(0, cap - occupiedVenueUnitsForDay(input.tiers, input.dayId))
}

export function capPublicSkuAvailable(input: {
  skuAvailable: number
  venueRemaining: number
}): number {
  const sku = Math.max(0, asInt(input.skuAvailable))
  const venue = Number.isFinite(input.venueRemaining)
    ? Math.max(0, asInt(input.venueRemaining))
    : sku
  return Math.min(sku, venue)
}

export function publicTierAvailable(input: {
  tier: PublicStockTier
  tiers: readonly PublicStockTier[]
  venueCapacity: number | null | undefined
  skuAvailable?: number
}): number {
  const sku = Math.max(
    0,
    input.skuAvailable == null ? skuRemaining(input.tier) : asInt(input.skuAvailable),
  )
  if (!occupiesVenuePublicStock(input.tier)) return sku
  const venueLeft = venueRemainingForDay({
    venueCapacity: input.venueCapacity,
    tiers: input.tiers,
    dayId: input.tier.day_id,
  })
  const peoplePerSku = venuePeoplePerSoldUnit(input.tier)
  const skuByVenue = Number.isFinite(venueLeft)
    ? Math.floor(Math.max(0, venueLeft) / peoplePerSku)
    : sku
  return capPublicSkuAvailable({ skuAvailable: sku, venueRemaining: skuByVenue })
}

export function publicCatalogTicketsLeft(input: {
  tiers: readonly PublicStockTier[] | null | undefined
  venueCapacity?: number | null
}): { soldRatio: number | null; ticketsLeft: number | null } {
  const publicTiers = (input.tiers ?? []).filter(
    (tier) => (tier.visibility ?? "public") !== "private",
  )
  if (!publicTiers.length) return { soldRatio: null, ticketsLeft: null }
  const capacity = publicTiers.reduce((sum, tier) => sum + asInt(tier.capacity), 0)
  const sold = publicTiers.reduce((sum, tier) => sum + asInt(tier.sold), 0)
  if (capacity <= 0) return { soldRatio: null, ticketsLeft: null }
  const skuLeft = Math.max(0, capacity - sold)
  const venueCap = asInt(input.venueCapacity)
  const venueLeft =
    venueCap > 0
      ? Math.max(0, venueCap - occupiedVenueUnitsForDay(publicTiers, null))
      : skuLeft
  return {
    soldRatio: Math.min(1, Math.max(0, sold / capacity)),
    ticketsLeft: Math.min(skuLeft, venueLeft),
  }
}
