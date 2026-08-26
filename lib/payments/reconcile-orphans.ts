import "server-only"

import { logger } from "@/lib/logger"
import { getMercadoPagoAccessToken } from "@/lib/mercadopago"
import { processPaidOrderNotification } from "@/lib/payments/core/confirm-order"
import {
  decideOrphanPaymentAction,
  type OrphanGatewayPayment,
} from "@/lib/payments/orphan-reconcile"
import { createAdminClient } from "@/lib/supabase/admin"

const MP_SEARCH_URL = "https://api.mercadopago.com/v1/payments/search"

type PendingReconcileOrder = {
  id: string
  total_amount: number
  payment_provider: string | null
  mp_preference_id: string | null
  provider_preference_id: string | null
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

export async function reconcileOrphanPaymentHolds(): Promise<{
  finalized: number
  kept: number
  released: number
}> {
  const admin = createAdminClient()
  const summary = { finalized: 0, kept: 0, released: 0 }

  const { data, error } = await admin
    .from("orders")
    .select(
      "id, total_amount, payment_provider, mp_preference_id, provider_preference_id",
    )
    .eq("status", "pending")
    .not("payment_started_at", "is", null)
    .order("payment_started_at", { ascending: true })
    .limit(40)

  if (error) {
    logger.error({
      context: "payments/reconcile-orphans",
      message: "list_pending_failed",
      error: error.message,
    })
    return summary
  }

  for (const order of (data ?? []) as PendingReconcileOrder[]) {
    const provider = (order.payment_provider ?? "mercadopago").trim()
    if (provider !== "mercadopago") {
      summary.kept += 1
      continue
    }

    const payments = await searchMercadoPagoPayments(order.id)
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
      } else {
        summary.kept += 1
      }
      continue
    }

    if (decided.action === "release") {
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
