import "server-only"

import { logger } from "@/lib/logger"
import { writeSecurityAuditLog } from "@/lib/security/audit-log"
import { createAdminClient } from "@/lib/supabase/admin"

export type DisputeRevokeStatus = "in_mediation" | "charged_back" | "refunded"

export async function revokeDisputedPaidOrder(input: {
  orderId: string
  status: DisputeRevokeStatus
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const orderStatus =
    input.status === "in_mediation" ? "refund_processing" : "refunded"

  const { error: refundError } = await admin.rpc("apply_order_refund_state", {
    p_order_id: input.orderId,
    p_order_status: orderStatus,
  })
  const { error: cancelError } = await admin.rpc("cancel_paid_order_tickets", {
    p_order_id: input.orderId,
  })

  if (refundError || cancelError) {
    const error = refundError?.message ?? cancelError?.message
    logger.error({
      context: "payments/dispute",
      message: "revoke_paid_order_failed",
      order_id: input.orderId,
      status: input.status,
      error,
    })
    return { ok: false, error }
  }

  if (input.status === "charged_back") {
    const { error: denylistError } = await admin.rpc(
      "record_buyer_denylist_from_order",
      {
        p_order_id: input.orderId,
        p_reason: "charged_back",
      },
    )
    if (denylistError) {
      logger.error({
        context: "payments/dispute",
        message: "buyer_denylist_record_failed",
        order_id: input.orderId,
        error: denylistError.message,
      })
    }
  }

  await writeSecurityAuditLog({
    action: "chargeback_revoke",
    entity: "order",
    entityId: input.orderId,
    details: { status: input.status },
  })

  return { ok: true }
}
