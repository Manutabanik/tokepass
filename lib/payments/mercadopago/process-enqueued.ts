import "server-only"

import { logger } from "@/lib/logger"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"
import { processVerifiedPaymentWebhook } from "@/lib/payments/core/process-verified-webhook"
import { resolveMercadoPagoChargebackPaymentId } from "@/lib/payments/mercadopago/chargebacks"
import { processMercadoPagoPaymentById } from "@/lib/payments/mercadopago/dispatch"
import { isMercadoPagoChargebackTopic } from "@/lib/payments/mercadopago/parse-notification"
import {
  claimPendingWebhookEvents,
  claimWebhookEventById,
  markWebhookEventFailed,
  markWebhookEventProcessed,
  type QueuedWebhookEvent,
} from "@/lib/payments/webhook-queue"

const GATEWAY_PROVIDERS = new Set<SupportedPaymentProvider>([
  "mercadopago",
  "payway",
  "naranjax",
  "modo",
  "stripe",
])

function asGatewayProvider(
  provider: string,
): SupportedPaymentProvider | null {
  return GATEWAY_PROVIDERS.has(provider as SupportedPaymentProvider)
    ? (provider as SupportedPaymentProvider)
    : null
}

async function processQueuedWebhookEvent(
  event: QueuedWebhookEvent,
): Promise<{ retry: boolean; reason?: string }> {
  const provider = asGatewayProvider(event.provider)
  if (provider && provider !== "mercadopago") {
    return processVerifiedPaymentWebhook(provider, event.payload)
  }

  let paymentId = event.external_event_id
  if (isMercadoPagoChargebackTopic(event.event_type)) {
    const resolved = await resolveMercadoPagoChargebackPaymentId(paymentId)
    if (!resolved) {
      return { retry: true, reason: "chargeback_payment_unresolved" }
    }
    paymentId = resolved
  }

  return processMercadoPagoPaymentById(paymentId, {
    eventType: event.event_type,
  })
}

export async function processEnqueuedWebhookEvent(
  eventId: string,
): Promise<void> {
  const claimed = await claimWebhookEventById(eventId)
  if (!claimed) return

  try {
    const result = await processQueuedWebhookEvent(claimed)
    if (result.retry) {
      await markWebhookEventFailed(
        claimed.id,
        result.reason ?? "retry",
        claimed.attempts,
      )
      return
    }
    await markWebhookEventProcessed(claimed.id)
  } catch (error) {
    logger.error({
      context: "payments/webhook-queue",
      message: "process_enqueued_failed",
      eventId,
      error,
    })
    await markWebhookEventFailed(
      claimed.id,
      error instanceof Error ? error.message : "process_failed",
      claimed.attempts,
    )
  }
}

export async function drainPendingWebhookEvents(
  limit = 10,
): Promise<{ processed: number; failed: number }> {
  const claimed = await claimPendingWebhookEvents(limit)
  let processed = 0
  let failed = 0

  for (const event of claimed) {
    try {
      const result = await processQueuedWebhookEvent(event)
      if (result.retry) {
        await markWebhookEventFailed(
          event.id,
          result.reason ?? "retry",
          event.attempts,
        )
        failed += 1
        continue
      }
      await markWebhookEventProcessed(event.id)
      processed += 1
    } catch (error) {
      logger.error({
        context: "payments/webhook-queue",
        message: "drain_event_failed",
        eventId: event.id,
        error,
      })
      await markWebhookEventFailed(
        event.id,
        error instanceof Error ? error.message : "process_failed",
        event.attempts,
      )
      failed += 1
    }
  }

  return { processed, failed }
}
