export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 12

export function notificationOutboxBackoffSeconds(attempts: number): number {
  return Math.min(2 ** Math.min(Math.max(attempts, 1), 9), 300)
}
