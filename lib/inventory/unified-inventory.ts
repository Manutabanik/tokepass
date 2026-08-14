export const INVENTORY_TIER_TYPES = [
  "seated",
  "general",
  "addon",
  "bundle",
] as const

export type InventoryTierType = (typeof INVENTORY_TIER_TYPES)[number]

export type InventoryBundleItem = {
  tierId: string
  quantity: number
}

export function parseInventoryTierType(raw: unknown): InventoryTierType | null {
  const value = String(raw ?? "").trim()
  if ((INVENTORY_TIER_TYPES as readonly string[]).includes(value)) {
    return value as InventoryTierType
  }
  return null
}

export function inferInventoryTierType(input: {
  tierType?: string | null
  layoutType?: string | null
  category?: string | null
  bundleItems?: InventoryBundleItem[] | null
}): InventoryTierType {
  const parsed = parseInventoryTierType(input.tierType)
  if (parsed) return parsed
  if (
    input.layoutType === "numbered_seat" ||
    input.layoutType === "table_combo"
  ) {
    return "seated"
  }
  if (
    input.category === "bundle" ||
    (input.bundleItems?.length ?? 0) > 0
  ) {
    return "bundle"
  }
  return "general"
}

export function layoutTypeForInventory(
  tierType: InventoryTierType,
  current?: string | null,
): "general" | "table_combo" | "numbered_seat" {
  if (tierType === "seated") {
    return current === "table_combo" ? "table_combo" : "numbered_seat"
  }
  return "general"
}

export function ticketCategoryForInventory(
  tierType: InventoryTierType,
): "standard" | "bundle" | "special" {
  if (tierType === "bundle") return "bundle"
  return "standard"
}

export function parseBundleItems(raw: unknown): InventoryBundleItem[] {
  if (!Array.isArray(raw)) return []
  const items: InventoryBundleItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const tierId = String(record.tierId ?? record.tier_id ?? "").trim()
    const quantity = Number(record.quantity ?? 0)
    if (!tierId || !Number.isFinite(quantity) || quantity < 1) continue
    items.push({
      tierId,
      quantity: Math.min(50, Math.floor(quantity)),
    })
  }
  return items
}

export function serializeBundleItems(
  items: InventoryBundleItem[],
): Array<{ tier_id: string; quantity: number }> {
  return items
    .filter((item) => item.tierId.trim().length > 0 && item.quantity > 0)
    .map((item) => ({
      tier_id: item.tierId.trim(),
      quantity: Math.min(50, Math.floor(item.quantity)),
    }))
}

export function isQuantityInventoryType(tierType: InventoryTierType): boolean {
  return tierType === "general" || tierType === "addon" || tierType === "bundle"
}
