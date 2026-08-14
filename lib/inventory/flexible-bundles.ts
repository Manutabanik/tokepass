export const BUNDLE_TYPES = [
  "multi_day_pass",
  "cross_sell_pack",
  "volume_discount",
] as const

export type BundleType = (typeof BUNDLE_TYPES)[number]

export const BUNDLE_TYPE_LABELS: Record<BundleType, string> = {
  multi_day_pass: "Abono de varios días",
  cross_sell_pack: "Pack entradas + extras",
  volume_discount: "Descuento por volumen",
}

export const BUNDLE_TYPE_HINTS: Record<BundleType, string> = {
  multi_day_pass:
    "Un pase para todas las jornadas. Ideal para festivales de 2 o 3 días.",
  cross_sell_pack:
    "Combiná entradas o mesas con estacionamiento, consumición u otros extras.",
  volume_discount:
    "Pack de cantidad: 2x1, 4x3 o N mesas al precio promocional.",
}

export type BundleComponent = {
  tierId: string
  quantity: number
}

export type BundleDraft = {
  name: string
  bundleType: BundleType
  price: number
  originalPrice: number
  capacity: number
  items: BundleComponent[]
  includesSeating: boolean
}

export function parseBundleType(raw: unknown): BundleType | null {
  const value = String(raw ?? "").trim()
  if ((BUNDLE_TYPES as readonly string[]).includes(value)) {
    return value as BundleType
  }
  return null
}

export function inferBundleType(input: {
  bundleType?: string | null
  dayId?: string | null
  isMultiDay?: boolean
  items?: BundleComponent[]
  componentTierTypes?: Record<string, string>
}): BundleType {
  const parsed = parseBundleType(input.bundleType)
  if (parsed) return parsed

  const items = input.items ?? []
  const types = items.map(
    (item) => input.componentTierTypes?.[item.tierId] ?? "general",
  )
  const hasAddon = types.includes("addon")
  const hasSeated = types.includes("seated")
  const uniqueTiers = new Set(items.map((item) => item.tierId))
  const volumeLike =
    uniqueTiers.size === 1 && (items[0]?.quantity ?? 0) > 1

  if (input.isMultiDay && !input.dayId) return "multi_day_pass"
  if (volumeLike && !hasAddon) return "volume_discount"
  if (hasAddon || hasSeated) return "cross_sell_pack"
  return "cross_sell_pack"
}

export function regularBundlePrice(
  items: BundleComponent[],
  unitPriceByTierId: Record<string, number>,
): number {
  return items.reduce((sum, item) => {
    const unit = Number(unitPriceByTierId[item.tierId] ?? 0)
    return sum + unit * Math.max(0, item.quantity)
  }, 0)
}

export function bundleSavings(originalPrice: number, salePrice: number): {
  amount: number
  percent: number
} {
  const amount = Math.max(0, Math.round((originalPrice - salePrice) * 100) / 100)
  const percent =
    originalPrice > 0 && salePrice < originalPrice
      ? Math.round((amount / originalPrice) * 100)
      : 0
  return { amount, percent }
}

export function validateBundleDraft(draft: {
  name: string
  items: BundleComponent[]
  price: number
  capacity: number
}): string | null {
  if (draft.name.trim().length < 2) {
    return "Nombrá el combo o abono."
  }
  if (draft.items.length < 1) {
    return "Elegí al menos un ítem incluido."
  }
  if (!Number.isFinite(draft.price) || draft.price < 0) {
    return "Indicá el precio promocional."
  }
  if (!Number.isInteger(draft.capacity) || draft.capacity < 1) {
    return "Definí cuántos combos hay a la venta."
  }
  return null
}

export function bundleIncludesSeating(
  items: BundleComponent[],
  componentTierTypes?: Record<string, string>,
): boolean {
  return items.some(
    (item) => componentTierTypes?.[item.tierId] === "seated",
  )
}
