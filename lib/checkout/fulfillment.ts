export type CheckoutFulfillmentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "not_found"

export const CHECKOUT_FULFILLMENT_POLL_MS = 2000
export const CHECKOUT_FULFILLMENT_MAX_MS = 3 * 60 * 1000
export const CHECKOUT_FULFILLMENT_HOLD_BUFFER_MS = 2 * 60 * 1000

export function mapOrderStatusToFulfillment(
  status: string | null | undefined,
): CheckoutFulfillmentStatus {
  if (status === "paid") return "paid"
  if (status === "pending") return "pending"
  if (status === "expired") return "expired"
  if (status === "failed" || status === "refunded" || status === "cancelled") {
    return "failed"
  }
  return "not_found"
}

export function nextFulfillmentPollDelay(
  elapsedMs: number,
  options?: { holdExpiresAt?: string | null; nowMs?: number },
): number | null {
  const now = options?.nowMs ?? Date.now()
  const startedAt = now - elapsedMs
  const holdMs = options?.holdExpiresAt
    ? new Date(options.holdExpiresAt).getTime()
    : Number.NaN
  const holdDeadline = Number.isFinite(holdMs)
    ? holdMs + CHECKOUT_FULFILLMENT_HOLD_BUFFER_MS
    : startedAt + CHECKOUT_FULFILLMENT_MAX_MS
  const deadline = Math.max(holdDeadline, startedAt + 15_000)
  if (now >= deadline) return null
  if (elapsedMs >= 120_000) return 8000
  if (elapsedMs >= 30_000) return 4000
  return CHECKOUT_FULFILLMENT_POLL_MS
}
