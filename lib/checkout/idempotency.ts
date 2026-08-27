import {
  checkoutItemElementId,
  checkoutItemSeatId,
  checkoutItemTierId,
  isMappedCheckoutItem,
} from "@/lib/checkout/hybrid-cart"
import type { CheckoutCartItem } from "@/lib/validations/checkout"

export const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 2 * 60 * 1000
export const CHECKOUT_IDEMPOTENCY_IN_PROGRESS_MS = 60 * 1000

export const CHECKOUT_IN_PROGRESS_ERROR =
  "Tu pago ya se está procesando. Esperá un momento."

export const CHECKOUT_IDEMPOTENCY_CART_MISMATCH_ERROR =
  "Tu carrito cambió. Actualizá e intentá de nuevo."

/** Must match `checkoutTicketRowsFingerprint`. Day is implied by seating_unit_id. */
export function checkoutCartFingerprint(items: CheckoutCartItem[]): string {
  return items
    .map((item) => {
      const mapped = isMappedCheckoutItem(item)
      const seat =
        checkoutItemSeatId(item) ?? checkoutItemElementId(item) ?? ""
      const quantity = mapped ? 1 : Math.max(0, Math.floor(item.quantity) || 0)
      return `${mapped ? "m" : "g"}:${checkoutItemTierId(item)}:${quantity}:${seat}`
    })
    .sort()
    .join("|")
}

export function checkoutTicketRowsFingerprint(
  rows: ReadonlyArray<{
    tier_id: string
    seating_unit_id?: string | null
  }>,
): string {
  const mapped: string[] = []
  const generalCount = new Map<string, number>()

  for (const row of rows) {
    const seat = row.seating_unit_id?.trim() ?? ""
    if (seat) {
      mapped.push(`m:${row.tier_id}:1:${seat}`)
      continue
    }
    generalCount.set(row.tier_id, (generalCount.get(row.tier_id) ?? 0) + 1)
  }

  const general = [...generalCount.entries()].map(
    ([tierId, quantity]) => `g:${tierId}:${quantity}:`,
  )
  return [...mapped, ...general].sort().join("|")
}

export function isReusableCheckoutOrderStatus(status: string | null | undefined): boolean {
  return status === "pending" || status === "paid"
}

export function isCheckoutIdempotencyInProgress(
  createdAt: string | Date | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!createdAt) return false
  const createdMs =
    createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime()
  if (!Number.isFinite(createdMs)) return false
  return nowMs - createdMs < CHECKOUT_IDEMPOTENCY_IN_PROGRESS_MS
}
