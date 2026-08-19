import { createHash, randomInt, timingSafeEqual } from "node:crypto"

export const DOOR_STAFF_GUEST_ROLE = "DOOR_STAFF_GUEST" as const
export const DOOR_ACCESS_PIN_DIGITS = 6
export const DOOR_ACCESS_PIN_TTL_MS = 24 * 60 * 60 * 1000
export const DOOR_PIN_LOOKUP_PREFIX = "tp-door-pin"

export function normalizeDoorAccessPin(raw: string): string | null {
  const pin = raw.replace(/\D/g, "").slice(0, DOOR_ACCESS_PIN_DIGITS)
  if (pin.length !== DOOR_ACCESS_PIN_DIGITS) return null
  return pin
}

export function generateDoorAccessPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(DOOR_ACCESS_PIN_DIGITS, "0")
}

export function hashDoorPinLookup(pin: string): string {
  return createHash("sha256")
    .update(`${DOOR_PIN_LOOKUP_PREFIX}:${pin}`)
    .digest("hex")
}

export function hashDoorPinSecret(eventId: string, pin: string): string {
  return createHash("sha256")
    .update(`${DOOR_PIN_LOOKUP_PREFIX}:${eventId}:${pin}`)
    .digest("hex")
}

export function doorPinHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function doorAccessPinExpiresAt(now = Date.now()): Date {
  return new Date(now + DOOR_ACCESS_PIN_TTL_MS)
}
