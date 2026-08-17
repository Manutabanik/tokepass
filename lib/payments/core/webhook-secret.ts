import { timingSafeEqual } from "node:crypto"

/**
 * Fail-closed webhook HMAC/header check.
 * Returns false when the configured secret is missing or empty.
 */
export function verifyWebhookSignature(
  provided: string,
  expected: string | undefined | null,
): boolean {
  const secret = expected?.trim() ?? ""
  if (!secret) return false
  const left = Buffer.from(secret)
  const right = Buffer.from(provided)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
