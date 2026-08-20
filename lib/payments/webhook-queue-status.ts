export const WEBHOOK_QUEUE_MAX_ATTEMPTS = 12

export function webhookFailureStatus(attempts: number): "failed" | "dead" {
  return attempts >= WEBHOOK_QUEUE_MAX_ATTEMPTS ? "dead" : "failed"
}
