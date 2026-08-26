import type { WebhookVerificationResult } from "@/lib/payments/core/interfaces"

export const VERIFIED_WEBHOOK_PAYLOAD_KIND = "verified_gateway_webhook" as const

export type QueuedVerifiedWebhookPayload = {
  kind: typeof VERIFIED_WEBHOOK_PAYLOAD_KIND
  verified: WebhookVerificationResult
}

export function toQueuedVerifiedWebhookPayload(
  verified: WebhookVerificationResult,
): QueuedVerifiedWebhookPayload {
  return {
    kind: VERIFIED_WEBHOOK_PAYLOAD_KIND,
    verified,
  }
}

export function readQueuedVerifiedWebhookPayload(
  payload: unknown,
): WebhookVerificationResult | null {
  if (!payload || typeof payload !== "object") return null
  const row = payload as {
    kind?: unknown
    verified?: Partial<WebhookVerificationResult> | null
  }
  if (row.kind !== VERIFIED_WEBHOOK_PAYLOAD_KIND) return null
  const verified = row.verified
  if (!verified || typeof verified !== "object") return null
  if (typeof verified.orderId !== "string") return null
  if (typeof verified.transactionId !== "string") return null
  if (typeof verified.status !== "string") return null
  if (typeof verified.amount !== "number") return null
  return {
    isValid: verified.isValid !== false,
    orderId: verified.orderId,
    transactionId: verified.transactionId,
    status: verified.status as WebhookVerificationResult["status"],
    amount: verified.amount,
    currency: verified.currency,
    rawPayload: verified.rawPayload,
  }
}

export function webhookHttpStatusAfterEnqueue(
  queued: { id: string } | null,
): 200 | 500 {
  return queued?.id ? 200 : 500
}
