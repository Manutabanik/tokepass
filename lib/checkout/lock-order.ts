import {
  checkoutItemSeatId,
  checkoutItemTierId,
} from "@/lib/checkout/hybrid-cart"
import type { CheckoutCartItem } from "@/lib/validations/checkout"

/** Total order for multi-row locks. Must match Postgres `ORDER BY uuid`. */

export function compareLockKey(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const a = left?.trim() ?? ""
  const b = right?.trim() ?? ""
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function sortLockKeys(
  ids: readonly (string | null | undefined)[],
): string[] {
  const unique = [
    ...new Set(
      ids
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  return unique.sort(compareLockKey)
}

export function sortReserveRpcItems<
  T extends {
    seating_unit_id?: string | null
    seat_id?: string | null
    ticket_tier_id?: string | null
    tier_id?: string | null
  },
>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const seat = compareLockKey(
      left.seating_unit_id || left.seat_id,
      right.seating_unit_id || right.seat_id,
    )
    if (seat !== 0) return seat
    return compareLockKey(
      left.ticket_tier_id || left.tier_id,
      right.ticket_tier_id || right.tier_id,
    )
  })
}

export function sortCheckoutItemsForLocks<T extends CheckoutCartItem>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => {
    const seat = compareLockKey(
      checkoutItemSeatId(left),
      checkoutItemSeatId(right),
    )
    if (seat !== 0) return seat
    return compareLockKey(checkoutItemTierId(left), checkoutItemTierId(right))
  })
}
