import "server-only"

import { logger } from "@/lib/logger"
import {
  WEBHOOK_QUEUE_MAX_ATTEMPTS,
  webhookFailureStatus,
} from "@/lib/payments/webhook-queue-status"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/types/database"

export { WEBHOOK_QUEUE_MAX_ATTEMPTS, webhookFailureStatus }

export type WebhookQueueStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed"
  | "dead"

export type QueuedWebhookEvent = {
  id: string
  provider: string
  external_event_id: string
  event_type: string
  payload: Json
  status: WebhookQueueStatus
  attempts: number
}

function toJson(value: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(value)) as Json
  } catch {
    return { unserializable: true }
  }
}

export async function enqueuePaymentWebhook(input: {
  provider: string
  externalEventId: string
  eventType: string
  payload: unknown
}): Promise<{ id: string; status: WebhookQueueStatus } | null> {
  const admin = createAdminClient()
  const externalEventId = input.externalEventId.trim()
  const provider = input.provider.trim()
  if (!externalEventId || !provider) return null

  const { data, error } = await admin.rpc("enqueue_payment_webhook_event", {
    p_provider: provider,
    p_external_event_id: externalEventId,
    p_event_type: input.eventType || "payment",
    p_payload: toJson(input.payload),
  })

  const row = Array.isArray(data) ? data[0] : data

  if (error || !row) {
    logger.error({
      context: "payments/webhook-queue",
      message: "enqueue_failed",
      provider,
      paymentId: externalEventId,
      error: error?.message,
    })
    return null
  }

  return {
    id: row.id,
    status: (row.status as WebhookQueueStatus) ?? "pending",
  }
}

export async function enqueueMercadoPagoWebhook(input: {
  paymentId: string
  eventType: string
  payload: unknown
}): Promise<{ id: string; status: WebhookQueueStatus } | null> {
  return enqueuePaymentWebhook({
    provider: "mercadopago",
    externalEventId: input.paymentId,
    eventType: input.eventType,
    payload: input.payload,
  })
}

export async function markWebhookEventProcessed(eventId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("payment_webhook_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", eventId)
    .neq("status", "processed")
}

export async function markWebhookEventFailed(
  eventId: string,
  errorMessage: string,
  attempts: number,
): Promise<void> {
  const status = webhookFailureStatus(attempts)
  const delaySeconds = Math.min(2 ** Math.min(attempts, 6), 300)
  const availableAt = new Date(Date.now() + delaySeconds * 1000).toISOString()
  const admin = createAdminClient()
  await admin
    .from("payment_webhook_events")
    .update({
      status,
      last_error: errorMessage.slice(0, 500),
      available_at: availableAt,
    })
    .eq("id", eventId)
    .neq("status", "processed")
}

export async function claimPendingWebhookEvents(
  limit = 10,
): Promise<QueuedWebhookEvent[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("claim_payment_webhook_events", {
    p_limit: limit,
  })

  if (error) {
    logger.error({
      context: "payments/webhook-queue",
      message: "claim_failed",
      error: error.message,
    })
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    external_event_id: row.external_event_id,
    event_type: row.event_type,
    payload: row.payload,
    status: (row.status as WebhookQueueStatus) ?? "processing",
    attempts: Number(row.attempts ?? 0),
  }))
}

export async function claimWebhookEventById(
  eventId: string,
): Promise<QueuedWebhookEvent | null> {
  const admin = createAdminClient()
  const { data: current, error: loadError } = await admin
    .from("payment_webhook_events")
    .select(
      "id, provider, external_event_id, event_type, payload, status, attempts",
    )
    .eq("id", eventId)
    .maybeSingle()

  if (loadError || !current) {
    if (loadError) {
      logger.error({
        context: "payments/webhook-queue",
        message: "claim_by_id_failed",
        eventId,
        error: loadError.message,
      })
    }
    return null
  }

  if (
    current.status === "processed" ||
    current.status === "processing" ||
    current.status === "dead" ||
    Number(current.attempts ?? 0) >= WEBHOOK_QUEUE_MAX_ATTEMPTS
  ) {
    return null
  }

  const { data, error } = await admin
    .from("payment_webhook_events")
    .update({
      status: "processing",
      attempts: Number(current.attempts ?? 0) + 1,
    })
    .eq("id", eventId)
    .in("status", ["pending", "failed"])
    .select(
      "id, provider, external_event_id, event_type, payload, status, attempts",
    )
    .maybeSingle()

  if (error) {
    logger.error({
      context: "payments/webhook-queue",
      message: "claim_by_id_failed",
      eventId,
      error: error.message,
    })
    return null
  }

  if (!data) return null

  return {
    id: data.id,
    provider: data.provider,
    external_event_id: data.external_event_id,
    event_type: data.event_type,
    payload: data.payload,
    status: (data.status as WebhookQueueStatus) ?? "processing",
    attempts: Number(data.attempts ?? 0),
  }
}
