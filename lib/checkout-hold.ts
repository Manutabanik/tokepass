/**
 * Política de holds de checkout / stock (Tokepass).
 *
 * GA, tienda y asientos numerados: 8 minutos.
 * - GA / pending: desde `orders.created_at` (`expire_abandoned_orders` + preferencia MP).
 * - Seating: `event_seating_units.reserved_until` al reservar (mismo TTL).
 */
export const GA_CHECKOUT_HOLD_MINUTES = 8
export const SEATING_HOLD_MINUTES = 8

export const GA_CHECKOUT_HOLD_INTERVAL = `${GA_CHECKOUT_HOLD_MINUTES} minutes` as const

export const GA_CHECKOUT_HOLD_MS = GA_CHECKOUT_HOLD_MINUTES * 60 * 1000

/** Fin del hold: seating usa reserved_until; GA/tienda = ahora + 8m. */
export function resolveCheckoutExpiresAt(
  reservedUntil?: string | null,
  nowMs: number = Date.now(),
): Date {
  if (reservedUntil) {
    const seatingMs = new Date(reservedUntil).getTime()
    if (Number.isFinite(seatingMs)) {
      return new Date(Math.min(seatingMs, nowMs + GA_CHECKOUT_HOLD_MS))
    }
  }
  return new Date(nowMs + GA_CHECKOUT_HOLD_MS)
}

export function formatHoldCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
