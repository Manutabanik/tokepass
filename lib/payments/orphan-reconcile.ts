import { GA_CHECKOUT_HOLD_MS } from "@/lib/checkout-hold"
import { RECONCILE_CRITICAL_HOLD_MS } from "@/lib/checkout/expire-holds-policy"
import { mapGatewayPaymentStatus } from "@/lib/payments/core/map-gateway-status"

export type OrphanReconcileAction = "finalize" | "keep" | "release"

export type OrphanGatewayPayment = {
  id: string
  status: string | null | undefined
  amount: number
  currency?: string | null
  raw?: unknown
}

/**
 * Zero-trust sobre el gateway, no sobre un hold eterno:
 * - approved → confirmar
 * - pending / in_mediation → keep (el cron igual corta a los 15m)
 * - búsqueda OK sin pagos (preferencia abandonada) → release
 * - rejected / cancelled → release
 * Si la búsqueda a MP falla, el caller no invoca esto (keep).
 */
export function decideOrphanPaymentAction(
  payments: readonly OrphanGatewayPayment[],
): {
  action: OrphanReconcileAction
  payment?: OrphanGatewayPayment
} {
  const approved = payments.find(
    (payment) => mapGatewayPaymentStatus(payment.status) === "approved",
  )
  if (approved) return { action: "finalize", payment: approved }

  const inFlight = payments.find((payment) => {
    const status = mapGatewayPaymentStatus(payment.status)
    return status === "pending" || status === "in_mediation"
  })
  if (inFlight) return { action: "keep", payment: inFlight }

  if (payments.length === 0) return { action: "release" }

  return { action: "release", payment: payments[0] }
}

export function shouldRefundOrphanFinalize(result: {
  ok: boolean
  needsRefund?: boolean
  code?: string
}): boolean {
  if (result.needsRefund === true) return true
  return result.code === "order_expired"
}

export function orphanHoldRemainingMs(
  paymentStartedAt: string | null | undefined,
  nowMs: number = Date.now(),
  holdMs: number = GA_CHECKOUT_HOLD_MS,
): number {
  const started = paymentStartedAt
    ? new Date(paymentStartedAt).getTime()
    : Number.NaN
  if (!Number.isFinite(started)) return Number.POSITIVE_INFINITY
  return started + holdMs - nowMs
}

export function isCriticalOrphanHold(
  paymentStartedAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const remaining = orphanHoldRemainingMs(paymentStartedAt, nowMs)
  return remaining > 0 && remaining <= RECONCILE_CRITICAL_HOLD_MS
}

function orphanHoldPriorityRank(remainingMs: number): number {
  if (remainingMs > 0 && remainingMs <= RECONCILE_CRITICAL_HOLD_MS) return 0
  if (remainingMs <= 0) return 1
  return 2
}

function startedAtOf(order: {
  paymentStartedAt?: string | null
  payment_started_at?: string | null
}): string | null {
  return order.paymentStartedAt ?? order.payment_started_at ?? null
}

/** Críticos (últimos 2 min) → vencidos (refund) → el resto, el más próximo a vencer primero. */
export function prioritizeOrphanReconcileOrders<
  T extends {
    paymentStartedAt?: string | null
    payment_started_at?: string | null
  },
>(orders: readonly T[], nowMs: number = Date.now()): T[] {
  return [...orders].sort((left, right) => {
    const leftRemaining = orphanHoldRemainingMs(startedAtOf(left), nowMs)
    const rightRemaining = orphanHoldRemainingMs(startedAtOf(right), nowMs)
    const rankDelta =
      orphanHoldPriorityRank(leftRemaining) -
      orphanHoldPriorityRank(rightRemaining)
    if (rankDelta !== 0) return rankDelta
    return leftRemaining - rightRemaining
  })
}
