import "server-only"

import { expandIndividualAccessTickets } from "@/lib/email/order-ticket-payload"
import { buildDynamicQrPatch, type PaidTicketQrRow } from "@/lib/tickets/ensure-dynamic-qr"
import { logger } from "@/lib/logger"
import { moneyAmountsEqual } from "@/lib/money/cents"
import { scheduleNotificationOutboxDrain } from "@/lib/notifications/outbox"
import { isAllowedPaymentCurrency } from "@/lib/payments/currency"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json, PaymentProvider } from "@/types/database"

export type ProcessPaidOrderNotificationInput = {
  provider: SupportedPaymentProvider
  transactionId: string
  orderId: string
  amount: number
  currency?: string | null
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

async function applyPaidOrderFollowThrough(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  provider: PaymentProvider,
  transactionId: string,
): Promise<void> {
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

  try {
    const { issueGuestReceiptAccess } = await import(
      "@/app/actions/guest-ticket-access"
    )
    await issueGuestReceiptAccess(orderId)
  } catch (error) {
    logger.error({
      context: "payments/confirm-order",
      message: "guest_access_issue_failed",
      orderId,
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

  void ensurePaidOrderDynamicQrs(orderId).catch((error) => {
    logger.error({
      context: "payments/confirm-order",
      message: "dynamic_qr_generate_failed",
      orderId,
      provider,
      transactionId,
      error,
    })
  })
}

/** QR, acceso invitado y drenaje del outbox (mail). Lo usa el webhook y sandbox. */
export async function fulfillPaidOrderAfterFinalize(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  provider: PaymentProvider,
  transactionId: string,
  options?: { drain?: boolean },
): Promise<void> {
  await applyPaidOrderFollowThrough(admin, orderId, provider, transactionId)
  if (options?.drain === false) return
  scheduleNotificationOutboxDrain()
}

async function ensurePaidOrderDynamicQrs(orderId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("tickets")
    .select(
      "id, qr_code, totp_secret, is_dynamic_qr, status, events(qr_type, delivery_mode)",
    )
    .eq("order_id", orderId)
    .eq("status", "valid")

  if (error) {
    throw new Error(error.message)
  }

  for (const row of (data ?? []) as PaidTicketQrRow[]) {
    const patch = buildDynamicQrPatch(row)
    if (!patch) continue
    const { error: updateError } = await admin
      .from("tickets")
      .update(patch)
      .eq("id", row.id)
      .eq("order_id", orderId)
    if (updateError) {
      throw new Error(updateError.message)
    }
  }
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

  if (!isAllowedPaymentCurrency(input.currency)) {
    logger.error({
      context: "payments/confirm-order",
      message: "currency_mismatch",
      orderId,
      provider,
      transactionId,
      currency: input.currency ?? "",
    })
    return { ok: false, code: "currency_mismatch", needsRefund: true }
  }

  const admin = createAdminClient()

  const { data: seen } = await admin
    .from("payment_webhook_events")
    .select("id, status")
    .eq("provider", provider)
    .eq("external_event_id", transactionId)
    .maybeSingle()

  if (seen?.status === "processed") {
    const { data: paidOrder } = await admin
      .from("orders")
      .select("id, provider_transaction_id, mp_payment_id")
      .eq("id", orderId)
      .maybeSingle()
    const sameTransaction =
      paidOrder?.provider_transaction_id === transactionId ||
      paidOrder?.mp_payment_id === transactionId
    if (sameTransaction) {
      await fulfillPaidOrderAfterFinalize(admin, orderId, provider, transactionId)
    }
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
    const promoExhausted = /PROMO_MAX_USES/i.test(finalizeError.message)
    logger.error({
      context: "payments/confirm-order",
      message: "finalize_rpc_failed",
      orderId,
      provider,
      transactionId,
      error: finalizeError.message,
    })
    return {
      ok: false,
      code: promoExhausted ? "promo_max_uses" : "finalize_failed",
      needsRefund: promoExhausted,
    }
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

  await fulfillPaidOrderAfterFinalize(admin, orderId, provider, transactionId)

  return {
    ok: true,
    code: finalize.code ?? "paid",
    idempotent: Boolean(finalize.idempotent),
  }
}
