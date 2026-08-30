import "server-only"

import { orderTestFlags } from "@/lib/finance/order-test-flags"
import { logger } from "@/lib/logger"
import { fulfillPaidOrderAfterFinalize } from "@/lib/payments/core/confirm-order"
import { createAdminClient } from "@/lib/supabase/admin"

/** Sella la orden/entradas de prueba y corre el mismo follow-through que el webhook. */
export async function fulfillSandboxPaidOrder(orderId: string): Promise<void> {
  const clean = orderId.trim()
  if (!clean) return

  const admin = createAdminClient()
  const { error: orderError } = await admin
    .from("orders")
    .update({
      ...orderTestFlags(true),
      payment_method: "test_sandbox",
      payment_provider: "sandbox",
      legal_consent_required: false,
    })
    .eq("id", clean)

  if (orderError) {
    logger.error({
      context: "checkout/sandbox",
      message: "sandbox_order_flag_failed",
      orderId: clean,
      error: orderError.message,
    })
  }

  const { error: ticketError } = await admin
    .from("tickets")
    .update({ is_test: true })
    .eq("order_id", clean)

  if (ticketError) {
    logger.error({
      context: "checkout/sandbox",
      message: "sandbox_ticket_flag_failed",
      orderId: clean,
      error: ticketError.message,
    })
  }

  await fulfillPaidOrderAfterFinalize(
    admin,
    clean,
    "sandbox",
    `sandbox:${clean}`,
  )
}
