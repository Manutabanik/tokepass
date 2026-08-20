import "server-only"

import { logger } from "@/lib/logger"
import { processMercadoPagoPaymentById } from "@/lib/payments/mercadopago/dispatch"
import {
  claimPendingWebhookEvents,
  claimWebhookEventById,
  markWebhookEventFailed,
  markWebhookEventProcessed,
} from "@/lib/payments/webhook-queue"

export async function processEnqueuedWebhookEvent(
  eventId: string,
): Promise<void> {
  const claimed = await claimWebhookEventById(eventId)
  if (!claimed) return

  try {
    const result = await processMercadoPagoPaymentById(
      claimed.external_event_id,
      { eventType: claimed.event_type },
    )
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
      const result = await processMercadoPagoPaymentById(
        event.external_event_id,
        { eventType: event.event_type },
      )
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
