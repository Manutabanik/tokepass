import "server-only"

import { after, NextResponse } from "next/server"

import { logger } from "@/lib/logger"
import { captureCriticalException } from "@/lib/sentry/capture"
import { PaymentGatewayFactory } from "@/lib/payments/core/factory"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"
import { toQueuedVerifiedWebhookPayload } from "@/lib/payments/core/verified-webhook-payload"
import { processEnqueuedWebhookEvent } from "@/lib/payments/mercadopago/process-enqueued"
import { enqueuePaymentWebhook } from "@/lib/payments/webhook-queue"

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

    const queued = await enqueuePaymentWebhook({
      provider,
      externalEventId: verified.transactionId.trim() || verified.orderId,
      eventType: verified.status,
      payload: toQueuedVerifiedWebhookPayload(verified),
    })

    if (!queued) {
      return webhookRetry({
        provider,
        reason: "enqueue_failed",
      })
    }

    if (queued.status !== "processed") {
      after(() => processEnqueuedWebhookEvent(queued.id))
    }

    return webhookAck({ provider, queued: true })
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
