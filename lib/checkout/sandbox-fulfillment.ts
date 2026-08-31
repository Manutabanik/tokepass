import "server-only"

import { sendPaidOrderReceiptEmail } from "@/lib/email/resend"
import { orderTestFlags } from "@/lib/finance/order-test-flags"
import { logger } from "@/lib/logger"
import { fulfillPaidOrderAfterFinalize } from "@/lib/payments/core/confirm-order"
import { createAdminClient } from "@/lib/supabase/admin"

async function markSandboxEmailOutboxProcessed(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<void> {
  const { error } = await admin
    .from("notification_outbox")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("order_id", orderId)
    .eq("channel", "email")
    .neq("status", "processed")

  if (error) {
    logger.warn({
      context: "checkout/sandbox",
      message: "sandbox_outbox_mark_failed",
      orderId,
      error: error.message,
    })
  }
}

async function countOrderTickets(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .neq("status", "cancelled")

  if (error) {
    throw new Error(error.message)
  }
  return count ?? 0
}

/** Sella la orden/entradas de prueba, emite tickets y manda el mail al toque. */
export async function fulfillSandboxPaidOrder(orderId: string): Promise<void> {
  const clean = orderId.trim()
  if (!clean) return

  const admin = createAdminClient()
  const testFlags = orderTestFlags(true)
  const sandboxTx = `sandbox:${clean}`

  const orderStamp = {
    ...testFlags,
    status: "paid" as const,
    payment_method: "test_sandbox" as const,
    provider_transaction_id: sandboxTx,
    mp_payment_id: sandboxTx,
    legal_consent_required: false,
  }

  let { error: orderError } = await admin
    .from("orders")
    .update({
      ...orderStamp,
      payment_provider: "sandbox",
    })
    .eq("id", clean)
    .in("status", ["pending", "paid"])

  if (orderError && /sandbox|enum|invalid|payment_provider/i.test(orderError.message)) {
    ;({ error: orderError } = await admin
      .from("orders")
      .update(orderStamp)
      .eq("id", clean)
      .in("status", ["pending", "paid"]))
  }

  if (orderError) {
    logger.error({
      context: "checkout/sandbox",
      message: "sandbox_order_flag_failed",
      orderId: clean,
      error: orderError.message,
    })
  }

  const { error: activateError } = await admin
    .from("tickets")
    .update({
      status: "valid",
      is_test: true,
    })
    .eq("order_id", clean)
    .eq("status", "pending_payment")

  if (activateError) {
    logger.error({
      context: "checkout/sandbox",
      message: "sandbox_ticket_activate_failed",
      orderId: clean,
      error: activateError.message,
    })
  }

  const { error: ticketFlagError } = await admin
    .from("tickets")
    .update({ is_test: true })
    .eq("order_id", clean)

  if (ticketFlagError) {
    logger.error({
      context: "checkout/sandbox",
      message: "sandbox_ticket_flag_failed",
      orderId: clean,
      error: ticketFlagError.message,
    })
  }

  const issued = await countOrderTickets(admin, clean)
  if (issued === 0) {
    throw new Error("sandbox_no_tickets")
  }

  await fulfillPaidOrderAfterFinalize(
    admin,
    clean,
    "sandbox",
    sandboxTx,
    { drain: false },
  )

  const { data: paidOrder } = await admin
    .from("orders")
    .select("status")
    .eq("id", clean)
    .maybeSingle()

  if (paidOrder?.status !== "paid") {
    throw new Error("sandbox_order_not_paid")
  }

  try {
    await sendPaidOrderReceiptEmail(admin, clean)
    await markSandboxEmailOutboxProcessed(admin, clean)
  } catch (error) {
    logger.error({
      context: "checkout/sandbox",
      message: "sandbox_receipt_email_failed",
      orderId: clean,
      error,
    })
  }
}
