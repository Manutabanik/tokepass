import "server-only"

import { expandIndividualAccessTickets } from "@/lib/email/order-ticket-payload"
import { sendPaidOrderReceiptEmail } from "@/lib/email/resend"
import { logger } from "@/lib/logger"
import { moneyAmountsEqual } from "@/lib/money/cents"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"
import { notifyGobiOrderPaid } from "@/lib/services/notify-gobi-order-paid"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json, PaymentProvider } from "@/types/database"

export type ProcessPaidOrderNotificationInput = {
  provider: SupportedPaymentProvider
  transactionId: string
  orderId: string
  amount: number
  rawPayload: unknown
}

export type ProcessPaidOrderNotificationResult = {
  ok: boolean
  code: string
  idempotent?: boolean
  needsRefund?: boolean
}

type FinalizePaidResult = {
  ok?: boolean
  code?: string
  needs_refund?: boolean
  idempotent?: boolean
  tickets_activated?: number
}

function toJson(value: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(value)) as Json
  } catch {
    return { unserializable: true }
  }
}

function asPaymentProvider(
  provider: SupportedPaymentProvider,
): PaymentProvider {
  return provider
}

export async function processPaidOrderNotification(
  input: ProcessPaidOrderNotificationInput,
): Promise<ProcessPaidOrderNotificationResult> {
  const orderId = input.orderId.trim()
  const transactionId = input.transactionId.trim()
  const provider = asPaymentProvider(input.provider)

  if (!orderId || !transactionId) {
    return { ok: false, code: "invalid_args" }
  }

  const admin = createAdminClient()

  const { data: seen } = await admin
    .from("payment_webhook_events")
    .select("id")
    .eq("provider", provider)
    .eq("external_event_id", transactionId)
    .maybeSingle()

  if (seen) {
    return { ok: true, code: "already_processed", idempotent: true }
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, total_amount")
    .eq("id", orderId)
    .maybeSingle()

  if (orderError || !order) {
    logger.error({
      context: "payments/confirm-order",
      message: "order_not_found",
      orderId,
      provider,
      transactionId,
      error: orderError?.message,
    })
    return { ok: false, code: "order_not_found" }
  }

  const expected = Number(order.total_amount)
  const paid = Number(input.amount)
  if (!moneyAmountsEqual(paid, expected)) {
    logger.error({
      context: "payments/confirm-order",
      message: "amount_mismatch",
      orderId,
      provider,
      transactionId,
      paid,
      expected,
    })
    return { ok: false, code: "amount_mismatch", needsRefund: true }
  }

  const { data: finalizeRaw, error: finalizeError } = await admin.rpc(
    "claim_and_finalize_paid_order",
    {
      p_order_id: orderId,
      p_provider: provider,
      p_transaction_id: transactionId,
      p_event_type: "payment.approved",
      p_payload: toJson(input.rawPayload),
    },
  )

  if (finalizeError) {
    logger.error({
      context: "payments/confirm-order",
      message: "finalize_rpc_failed",
      orderId,
      provider,
      transactionId,
      error: finalizeError.message,
    })
    return { ok: false, code: "finalize_failed" }
  }

  const finalize = (finalizeRaw ?? {}) as FinalizePaidResult

  if (finalize.ok !== true) {
    return {
      ok: false,
      code: finalize.code ?? "finalize_rejected",
      needsRefund: Boolean(finalize.needs_refund),
      idempotent: Boolean(finalize.idempotent),
    }
  }

  try {
    const { error: leftoverError } = await admin.rpc(
      "release_leftover_cart_holds_for_order",
      { p_order_id: orderId },
    )
    if (leftoverError) {
      logger.error({
        context: "payments/confirm-order",
        message: "leftover_holds_release_failed",
        orderId,
        provider,
        transactionId,
        error: leftoverError.message,
      })
    }
  } catch (error) {
    logger.error({
      context: "payments/confirm-order",
      message: "leftover_holds_release_failed",
      orderId,
      provider,
      transactionId,
      error,
    })
  }

  if (!finalize.idempotent) {
    let access: { magicUrl: string; otp: string } | null = null
    try {
      const { issueGuestReceiptAccess } = await import(
        "@/app/actions/guest-ticket-access"
      )
      access = await issueGuestReceiptAccess(orderId)
    } catch (error) {
      logger.error({
        context: "payments/confirm-order",
        message: "guest_access_issue_failed",
        orderId,
        error,
      })
    }

    try {
      await notifyGobiOrderPaid(admin, orderId, access)
    } catch (error) {
      logger.error({
        context: "payments/confirm-order",
        message: "gobi_dispatch_failed",
        orderId,
        provider,
        transactionId,
        error,
      })
    }

    try {
      await expandIndividualAccessTickets(admin, orderId)
    } catch (error) {
      logger.error({
        context: "payments/confirm-order",
        message: "expand_access_tickets_failed",
        orderId,
        provider,
        transactionId,
        error,
      })
    }

    try {
      await sendPaidOrderReceiptEmail(admin, orderId, access)
    } catch (error) {
      logger.error({
        context: "payments/confirm-order",
        message: "receipt_email_failed",
        orderId,
        provider,
        transactionId,
        error,
      })
    }
  }

  return {
    ok: true,
    code: finalize.code ?? "paid",
    idempotent: Boolean(finalize.idempotent),
  }
}
