import "server-only"

import { processPaidOrderNotification } from "@/lib/payments/core/confirm-order"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"
import { isDisputedGatewayStatus } from "@/lib/payments/core/map-gateway-status"
import { revokeDisputedPaidOrder } from "@/lib/payments/core/revoke-disputed-order"
import { readQueuedVerifiedWebhookPayload } from "@/lib/payments/core/verified-webhook-payload"
import type { MercadoPagoJobResult } from "@/lib/payments/mercadopago/dispatch"

export async function processVerifiedPaymentWebhook(
  provider: SupportedPaymentProvider,
  payload: unknown,
): Promise<MercadoPagoJobResult> {
  const verified = readQueuedVerifiedWebhookPayload(payload)
  if (!verified?.isValid) {
    return { retry: false, reason: "invalid_payload" }
  }

  if (isDisputedGatewayStatus(verified.status)) {
    const revoked = await revokeDisputedPaidOrder({
      orderId: verified.orderId,
      status: verified.status,
    })
    if (!revoked.ok) {
      return { retry: true, reason: revoked.error ?? "dispute_revoke_failed" }
    }
    return { retry: false, reason: "revoked" }
  }

  if (verified.status !== "approved") {
    return { retry: false, reason: "not_approved" }
  }

  const result = await processPaidOrderNotification({
    provider,
    transactionId: verified.transactionId,
    orderId: verified.orderId,
    amount: verified.amount,
    currency: verified.currency,
    rawPayload: verified.rawPayload,
  })

  if (!result.ok && !result.needsRefund) {
    return { retry: true, reason: result.code }
  }

  return { retry: false, reason: result.code }
}
