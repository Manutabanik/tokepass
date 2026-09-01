import { GA_CHECKOUT_HOLD_MS } from "@/lib/checkout-hold"

/** Reconcile de huérfanos MP por tick (cron cada minuto, los más viejos primero). */
export const RECONCILE_ORPHAN_BATCH_SIZE = 200

export function holdTtlCutoffIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - GA_CHECKOUT_HOLD_MS).toISOString()
}

/**
 * Espejo de `expire_abandoned_orders`:
 * - sin pago: 15m desde `created_at`
 * - con preferencia MP: 15m desde `payment_started_at`
 */
export function shouldExpireAbandonedOrder(
  order: {
    status: string
    createdAt: string
    paymentStartedAt?: string | null
  },
  nowMs: number = Date.now(),
  holdMs: number = GA_CHECKOUT_HOLD_MS,
): boolean {
  if (order.status !== "pending") return false
  const startedMs = order.paymentStartedAt
    ? new Date(order.paymentStartedAt).getTime()
    : Number.NaN
  if (Number.isFinite(startedMs)) {
    return startedMs + holdMs <= nowMs
  }
  const createdMs = new Date(order.createdAt).getTime()
  if (!Number.isFinite(createdMs)) return false
  return createdMs + holdMs <= nowMs
}
