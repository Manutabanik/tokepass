import "server-only"

import { NextResponse } from "next/server"

import { logger } from "@/lib/logger"
import { captureCriticalException } from "@/lib/sentry/capture"
import { processPaidOrderNotification } from "@/lib/payments/core/confirm-order"
import { PaymentGatewayFactory } from "@/lib/payments/core/factory"
import { isDisputedGatewayStatus } from "@/lib/payments/core/map-gateway-status"
import { revokeDisputedPaidOrder } from "@/lib/payments/core/revoke-disputed-order"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"

const ORDER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function webhookAck(data?: Record<string, unknown>) {
  return NextResponse.json({ received: true, ...(data ?? {}) }, { status: 200 })
}

export function webhookRetry(data?: Record<string, unknown>) {
  return NextResponse.json({ received: false, ...(data ?? {}) }, { status: 500 })
}

export async function handlePaymentProviderWebhook(
  provider: SupportedPaymentProvider,
  req: Request,
): Promise<NextResponse> {
  try {
    const adapter = PaymentGatewayFactory.getAdapter(provider)
    const verified = await adapter.verifyWebhook(req)

    if (!verified.isValid) {
      return webhookAck({ ignored: true, reason: "invalid_webhook" })
    }

    if (!ORDER_UUID.test(verified.orderId)) {
      return webhookAck({
        ignored: true,
        reason: "unrecognized_order_id",
      })
    }

    if (isDisputedGatewayStatus(verified.status)) {
      const revoked = await revokeDisputedPaidOrder({
        orderId: verified.orderId,
        status: verified.status,
      })
      if (!revoked.ok) {
        return webhookRetry({
          provider,
          reason: revoked.error ?? "dispute_revoke_failed",
          status: verified.status,
        })
      }
      return webhookAck({
        provider,
        status: verified.status,
        revoked: true,
      })
    }

    if (verified.status !== "approved") {
      return webhookAck({
        ignored: true,
        reason: "not_approved",
        status: verified.status,
      })
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
      return webhookRetry({
        provider,
        ...result,
      })
    }

    return webhookAck({
      provider,
      ...result,
    })
  } catch (error) {
    captureCriticalException(error, "payments/webhook", { provider })
    logger.error({
      context: "payments/webhook",
      message: "unexpected_webhook_error",
      provider,
      error,
    })
    return webhookRetry({ recovered: false })
  }
}
