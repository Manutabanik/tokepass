import { GA_CHECKOUT_HOLD_MS } from "@/lib/checkout-hold"

/** Pending más viejos por tick (además del lote crítico de 2 minutos). */
export const RECONCILE_ORPHAN_BATCH_SIZE = 800

/** Holds en los últimos 2 minutos de vida: se buscan sí o sí para salvar el cobro. */
export const RECONCILE_CRITICAL_HOLD_MS = 2 * 60 * 1000
export const RECONCILE_CRITICAL_BATCH_SIZE = 400

/** Expired recientes: reintento de refund si el tick anterior falló contra MP. */
export const RECONCILE_EXPIRED_REFUND_BATCH_SIZE = 100
export const RECONCILE_EXPIRED_LOOKBACK_MS = 12 * 60 * 60 * 1000

/**
 * Búsquedas MP en paralelo. 8 × ~lote/minuto queda bajo el tope típico de 1000 RPM.
 */
export const RECONCILE_MP_SEARCH_CONCURRENCY = 8

export const RECONCILE_MAX_PER_TICK =
  RECONCILE_CRITICAL_BATCH_SIZE +
  RECONCILE_ORPHAN_BATCH_SIZE +
  RECONCILE_EXPIRED_REFUND_BATCH_SIZE

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
