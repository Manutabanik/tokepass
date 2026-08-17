import { HIGH_DEMAND_LOCK_TIMEOUT } from "@/lib/checkout/lock-timeout"
import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"

export const CHECKOUT_STOCK_TAKEN_MESSAGE =
  "Lo sentimos, las entradas que elegiste se agotaron en este instante. Por favor, seleccioná otra ubicación o día."

export function isCheckoutStockConflict(error: string): boolean {
  if (error === HIGH_DEMAND_LOCK_TIMEOUT) return false
  const normalized = error.toLowerCase()
  return (
    error === "out_of_stock" ||
    error === "conflict" ||
    normalized.includes("409") ||
    normalized.includes("conflict") ||
    normalized.includes("sold out") ||
    normalized.includes("stock") ||
    normalized.includes("agotad") ||
    normalized.includes("capacidad") ||
    normalized.includes("seating_unit_unavailable") ||
    normalized.includes("already taken") ||
    normalized.includes("recinto") ||
    normalized.includes("asiento") ||
    normalized.includes("ubicaci")
  )
}

export type CartHoldRow = {
  hold_kind: string
  tier_id: string
  quantity: number
  seating_unit_id?: string | null
  layout_item_id?: string | null
  label?: string | null
  reserved_until: string
}

export function filterSelectedItemsByHolds(
  items: StorefrontSelectedItem[],
  holds: readonly CartHoldRow[],
): StorefrontSelectedItem[] {
  const seatIds = new Set<string>()
  for (const hold of holds) {
    if (hold.hold_kind !== "seat") continue
    if (hold.seating_unit_id) seatIds.add(hold.seating_unit_id)
    if (hold.layout_item_id) seatIds.add(hold.layout_item_id)
  }

  return items.filter((item) => {
    if (item.type === "zone" || item.type === "standing") return true
    if (seatIds.size === 0) return false
    return seatIds.has(item.id)
  })
}

export function rehydrateSelectedItemsFromHolds(input: {
  items: StorefrontSelectedItem[]
  holds: readonly CartHoldRow[]
  source: "server" | "unavailable"
  resolveHoldItem?: (hold: CartHoldRow) => StorefrontSelectedItem | null
}): StorefrontSelectedItem[] {
  if (input.source === "unavailable") return input.items

  const seatHolds = input.holds.filter((hold) => hold.hold_kind === "seat")
  const holdIds = new Set<string>()
  for (const hold of seatHolds) {
    if (hold.seating_unit_id) holdIds.add(hold.seating_unit_id)
    if (hold.layout_item_id) holdIds.add(hold.layout_item_id)
  }

  const kept = input.items.filter((item) => {
    if (item.type === "zone" || item.type === "standing") return true
    return holdIds.has(item.id)
  })
  const seen = new Set(kept.map((item) => item.id))

  for (const hold of seatHolds) {
    const candidates = [hold.layout_item_id, hold.seating_unit_id].filter(
      (id): id is string => Boolean(id),
    )
    if (candidates.some((id) => seen.has(id))) continue
    const resolved = input.resolveHoldItem?.(hold)
    if (!resolved) continue
    kept.push(resolved)
    seen.add(resolved.id)
  }

  return kept
}

export function earliestHoldExpiry(holds: readonly CartHoldRow[]): string | null {
  let min: string | null = null
  for (const hold of holds) {
    if (!hold.reserved_until) continue
    if (!min || hold.reserved_until < min) min = hold.reserved_until
  }
  return min
}
