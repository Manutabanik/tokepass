import { GA_CHECKOUT_HOLD_MS, formatHoldCountdown } from "@/lib/checkout-hold"

export function nextCartHoldExpiresAt(nowMs: number = Date.now()): string {
  return new Date(nowMs + GA_CHECKOUT_HOLD_MS).toISOString()
}

export function remainingHoldSeconds(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!expiresAt) return 0
  const end = new Date(expiresAt).getTime()
  if (!Number.isFinite(end)) return 0
  return Math.max(0, Math.ceil((end - nowMs) / 1000))
}

export function isCartHoldExpired(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!expiresAt) return false
  const end = new Date(expiresAt).getTime()
  if (!Number.isFinite(end)) return false
  return end <= nowMs
}

export function formatCartHoldClock(
  expiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  return formatHoldCountdown(remainingHoldSeconds(expiresAt, nowMs))
}

export function cartHasHoldableItems(input: {
  lines?: Array<{ quantity?: number | null }> | null
  quantities?: Record<string, number> | null
  itemsCount?: number | null
}): boolean {
  if ((input.itemsCount ?? 0) > 0) return true
  if ((input.lines ?? []).some((line) => (line.quantity ?? 0) > 0)) return true
  return Object.values(input.quantities ?? {}).some((qty) => qty > 0)
}
