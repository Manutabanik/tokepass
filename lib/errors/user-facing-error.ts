import { isRelationalIntegrityError } from "@/lib/events/sanitize-ticket-tiers"

export const INVENTORY_SYNC_MESSAGE =
  "Sincronizando inventario, por favor intente nuevamente."

const SCREAMING_SNAKE = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/
const ONLY_INTERNAL_CODE = /^[A-Z]+(_[A-Z0-9]+)+$/
const POSTGRES_OR_POSTGREST = /\b(PGRST\d+|22P02|23503|23505|42703|42P01)\b/i

export function containsInternalErrorCode(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (ONLY_INTERNAL_CODE.test(trimmed)) return true
  if (SCREAMING_SNAKE.test(trimmed)) return true
  if (isRelationalIntegrityError(trimmed)) return true
  if (POSTGRES_OR_POSTGREST.test(trimmed)) return true
  return false
}

export function toUserFacingError(
  text: unknown,
  fallback = INVENTORY_SYNC_MESSAGE,
): string {
  if (text == null) return fallback
  const message = String(text).trim()
  if (!message) return fallback
  if (containsInternalErrorCode(message)) return fallback
  return message
}
