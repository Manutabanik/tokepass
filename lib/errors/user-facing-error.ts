import { seatingPersistUserMessage } from "@/lib/events/sanitize-ticket-tiers"
import {
  APP_ERRORS,
  containsInternalErrorCode,
  isSafeUserFacingCopy,
  mapUnknownError,
} from "@/lib/errors/error-handler"
import {
  classifyPersistError,
  NETWORK_SAVE_MESSAGE,
} from "@/lib/errors/persist-error"
import { isUnmaskedSupabaseError } from "@/lib/errors/supabase-error"

export const INVENTORY_SYNC_MESSAGE = APP_ERRORS.INVENTORY_SYNC.message

export const GENERIC_PUBLIC_ERROR =
  "Tuvimos un problema técnico de nuestro lado. Volvé a intentar en un ratito"

export { containsInternalErrorCode, isSafeUserFacingCopy, mapUnknownError }

export function toUserFacingError(
  text: unknown,
  fallback = INVENTORY_SYNC_MESSAGE,
): string {
  const seatingMessage = seatingPersistUserMessage(text)
  if (seatingMessage) return seatingMessage
  if (classifyPersistError(text) === "network") return NETWORK_SAVE_MESSAGE
  const safeFallback = isSafeUserFacingCopy(fallback)
    ? fallback
    : GENERIC_PUBLIC_ERROR
  if (isUnmaskedSupabaseError(text)) return safeFallback
  const message = mapUnknownError(text, {
    code: "SAVE_FAILED",
    title: "No pudimos guardar los cambios",
    message: safeFallback,
  }).message
  if (/^(unknown|error\s*500|internal server error|500)$/i.test(message.trim())) {
    return safeFallback
  }
  return isSafeUserFacingCopy(message) ? message : safeFallback
}
