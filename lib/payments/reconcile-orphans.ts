import "server-only"

import {
  RECONCILE_CRITICAL_BATCH_SIZE,
  RECONCILE_CRITICAL_HOLD_MS,
  RECONCILE_EXPIRED_LOOKBACK_MS,
  RECONCILE_EXPIRED_REFUND_BATCH_SIZE,
  RECONCILE_MAX_PER_TICK,
  RECONCILE_MP_SEARCH_CONCURRENCY,
  RECONCILE_ORPHAN_BATCH_SIZE,
} from "@/lib/checkout/expire-holds-policy"
import { GA_CHECKOUT_HOLD_MS } from "@/lib/checkout-hold"
import { logger } from "@/lib/logger"
import { getMercadoPagoAccessToken } from "@/lib/mercadopago"
import { processPaidOrderNotification } from "@/lib/payments/core/confirm-order"
import { refundExpiredPayment } from "@/lib/payments/mercadopago/refund-expired-payment"
import {
  decideOrphanPaymentAction,
  prioritizeOrphanReconcileOrders,
  shouldRefundOrphanFinalize,
  type OrphanGatewayPayment,
} from "@/lib/payments/orphan-reconcile"
import { createAdminClient } from "@/lib/supabase/admin"

const MP_SEARCH_URL = "https://api.mercadopago.com/v1/payments/search"

const ORDER_SELECT =
  "id, status, total_amount, payment_provider, mp_preference_id, provider_preference_id, payment_started_at"

type PendingReconcileOrder = {
  id: string
  status?: string | null
  total_amount: number
  payment_provider: string | null
  mp_preference_id: string | null
  provider_preference_id: string | null
  payment_started_at: string | null
}

export type ReconcileOrphanSummary = {
  finalized: number
  kept: number
  released: number
  refunded: number
  refundFailed: number
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index] as T)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

async function searchMercadoPagoPayments(
  orderId: string,
): Promise<OrphanGatewayPayment[] | null> {
  try {
    const token = getMercadoPagoAccessToken()
    const url = new URL(MP_SEARCH_URL)
    url.searchParams.set("external_reference", orderId)
    url.searchParams.set("sort", "date_created")
    url.searchParams.set("criteria", "desc")
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!response.ok) {
      logger.error({
        context: "payments/reconcile-orphans",
        message: "mp_search_failed",
        orderId,
        status: response.status,
      })
      return null
    }
    const body = (await response.json()) as {
      results?: Array<{
        id?: number | string
        status?: string
        transaction_amount?: number
        currency_id?: string
      }>
    }
    return (body.results ?? [])
      .map((row) => ({
        id: String(row.id ?? ""),
        status: row.status,
        amount: Number(row.transaction_amount ?? 0),
        currency: row.currency_id ?? "ARS",
        raw: row,
      }))
      .filter((row) => row.id.length > 0)
  } catch (error) {
    logger.error({
      context: "payments/reconcile-orphans",
      message: "mp_search_error",
      orderId,
      error,
    })
    return null
  }
}

async function loadReconcileCandidateOrders(
  admin: ReturnType<typeof createAdminClient>,
  nowMs: number,
): Promise<PendingReconcileOrder[]> {
  const criticalFrom = new Date(nowMs - GA_CHECKOUT_HOLD_MS).toISOString()
  const criticalTo = new Date(
    nowMs - (GA_CHECKOUT_HOLD_MS - RECONCILE_CRITICAL_HOLD_MS),
  ).toISOString()
  const expiredSince = new Date(
    nowMs - RECONCILE_EXPIRED_LOOKBACK_MS,
  ).toISOString()

  const pending = admin
    .from("orders")
    .select(ORDER_SELECT)
    .eq("status", "pending")
    .not("payment_started_at", "is", null)

  const [critical, oldestPending, recentExpired] = await Promise.all([
    pending
      .gte("payment_started_at", criticalFrom)
      .lte("payment_started_at", criticalTo)
      .order("payment_started_at", { ascending: true })
      .limit(RECONCILE_CRITICAL_BATCH_SIZE),
    admin
      .from("orders")
      .select(ORDER_SELECT)
      .eq("status", "pending")
      .not("payment_started_at", "is", null)
      .order("payment_started_at", { ascending: true })
      .limit(RECONCILE_ORPHAN_BATCH_SIZE),
    admin
      .from("orders")
      .select(ORDER_SELECT)
      .eq("status", "expired")
      .not("payment_started_at", "is", null)
      .gte("updated_at", expiredSince)
      .order("updated_at", { ascending: false })
      .limit(RECONCILE_EXPIRED_REFUND_BATCH_SIZE),
  ])

  for (const result of [critical, oldestPending, recentExpired]) {
    if (result.error) {
      logger.error({
        context: "payments/reconcile-orphans",
        message: "list_pending_failed",
        error: result.error.message,
      })
    }
  }

  const byId = new Map<string, PendingReconcileOrder>()
  for (const row of [
    ...((critical.data ?? []) as PendingReconcileOrder[]),
    ...((oldestPending.data ?? []) as PendingReconcileOrder[]),
    ...((recentExpired.data ?? []) as PendingReconcileOrder[]),
  ]) {
    if (!byId.has(row.id)) byId.set(row.id, row)
  }

  return prioritizeOrphanReconcileOrders([...byId.values()], nowMs).slice(
    0,
    RECONCILE_MAX_PER_TICK,
  )
}

async function refundOrphanPayment(input: {
  orderId: string
  paymentId: string
  code: string
}): Promise<boolean> {
  try {
    await refundExpiredPayment(input.paymentId)
    logger.info({
      context: "payments/reconcile-orphans",
      message: "orphan_refund_ok",
      orderId: input.orderId,
      paymentId: input.paymentId,
      code: input.code,
    })
    return true
  } catch (error) {
    logger.error({
      context: "payments/reconcile-orphans",
      message: "orphan_refund_failed",
      orderId: input.orderId,
      paymentId: input.paymentId,
      code: input.code,
      error,
    })
    return false
  }
}

export async function reconcileOrphanPaymentHolds(): Promise<ReconcileOrphanSummary> {
  const admin = createAdminClient()
  const summary: ReconcileOrphanSummary = {
    finalized: 0,
    kept: 0,
    released: 0,
    refunded: 0,
    refundFailed: 0,
  }

  const orders = await loadReconcileCandidateOrders(admin, Date.now())

  const searched = await mapWithConcurrency(
    orders,
    RECONCILE_MP_SEARCH_CONCURRENCY,
    async (order) => ({
      order,
      payments:
        (order.payment_provider ?? "mercadopago").trim() === "mercadopago"
          ? await searchMercadoPagoPayments(order.id)
          : null,
      skipProvider: (order.payment_provider ?? "mercadopago").trim() !== "mercadopago",
    }),
  )

  for (const item of searched) {
    if (item.skipProvider) {
      summary.kept += 1
      continue
    }

    const { order, payments } = item
    if (payments == null) {
      summary.kept += 1
      continue
    }

    const decided = decideOrphanPaymentAction(payments)
    if (decided.action === "finalize" && decided.payment) {
      const result = await processPaidOrderNotification({
        provider: "mercadopago",
        transactionId: decided.payment.id,
        orderId: order.id,
        amount: decided.payment.amount,
        currency: decided.payment.currency,
        rawPayload: decided.payment.raw,
      })

      if (result.ok) {
        summary.finalized += 1
        continue
      }

      if (shouldRefundOrphanFinalize(result)) {
        const refunded = await refundOrphanPayment({
          orderId: order.id,
          paymentId: decided.payment.id,
          code: result.code,
        })
        if (refunded) {
          summary.refunded += 1
        } else {
          summary.refundFailed += 1
        }
        continue
      }

      summary.kept += 1
      continue
    }

    if (decided.action === "release") {
      if (order.status === "expired") {
        summary.kept += 1
        continue
      }
      const { error: expireError } = await admin.rpc("expire_abandoned_order", {
        p_order_id: order.id,
      })
      if (expireError) {
        logger.error({
          context: "payments/reconcile-orphans",
          message: "release_failed",
          orderId: order.id,
          error: expireError.message,
        })
        summary.kept += 1
        continue
      }
      summary.released += 1
      continue
    }

    summary.kept += 1
  }

  logger.info({
    context: "payments/reconcile-orphans",
    message: "reconcile_orphans_ok",
    ...summary,
  })
  return summary
}
