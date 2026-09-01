import { serverUtcMs } from "@/lib/time/server-now"

/**
 * Política de holds de checkout / stock (TokePass).
 *
 * GA, tienda y asientos numerados: 15 minutos.
 * - GA / pending: desde `orders.created_at` (`expire_abandoned_orders` + preferencia MP).
 * - Seating: `seat_holds.expires_at` + `event_seating_units.reserved_until`.
 */
export const GA_CHECKOUT_HOLD_MINUTES = 15
export const SEATING_HOLD_MINUTES = 15

export const GA_CHECKOUT_HOLD_INTERVAL = `${GA_CHECKOUT_HOLD_MINUTES} minutes` as const

/** Cron cada minuto: lote al tope SQL (SKIP LOCKED) para drenar picos de 3k carritos. */
export const EXPIRE_HOLD_BATCH_SIZE = 2000

export const GA_CHECKOUT_HOLD_MS = GA_CHECKOUT_HOLD_MINUTES * 60 * 1000

export const HOLD_EXPIRED_MESSAGE = "Tu reserva ha expirado por tiempo"

export const SEAT_HOLD_EXPIRED_ERROR =
  "Tu reserva expiró o el asiento ya no está disponible. Elegí de nuevo."

export const CART_HOLD_EXPIRED_MODAL_TITLE = "Reserva expirada"

export const CART_HOLD_EXPIRED_MODAL_MESSAGE =
  "Tu tiempo de reserva expiró. Los asientos han sido liberados."

/** El más próximo de dos `reserved_until` ISO del servidor. */
export function minReservedUntil(
  left?: string | null,
  right?: string | null,
): string | null {
  const leftMs = left ? new Date(left).getTime() : Number.NaN
  const rightMs = right ? new Date(right).getTime() : Number.NaN
  const leftOk = Number.isFinite(leftMs)
  const rightOk = Number.isFinite(rightMs)
  if (leftOk && rightOk) return leftMs <= rightMs ? left! : right!
  if (leftOk) return left!
  if (rightOk) return right!
  return null
}

/** Fin del hold: seating usa reserved_until; GA/tienda = ahora + 15m. */
export function resolveCheckoutExpiresAt(
  reservedUntil?: string | null,
  nowMs: number = serverUtcMs(),
): Date {
  if (reservedUntil) {
    const seatingMs = new Date(reservedUntil).getTime()
    if (Number.isFinite(seatingMs)) {
      return new Date(Math.min(seatingMs, nowMs + GA_CHECKOUT_HOLD_MS))
    }
  }
  return new Date(nowMs + GA_CHECKOUT_HOLD_MS)
}

/** Fin del hold para una orden ya creada (fallback / cuenta), anclado a `created_at`. */
export function resolveOrderHoldExpiresAt(
  createdAt: string,
  reservedUntil?: string | null,
): Date {
  const createdMs = new Date(createdAt).getTime()
  const fromCreated = Number.isFinite(createdMs)
    ? createdMs + GA_CHECKOUT_HOLD_MS
    : serverUtcMs() + GA_CHECKOUT_HOLD_MS

  if (reservedUntil) {
    const seatingMs = new Date(reservedUntil).getTime()
    if (Number.isFinite(seatingMs)) {
      return new Date(Math.min(seatingMs, fromCreated))
    }
  }

  return new Date(fromCreated)
}

export function formatHoldCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
