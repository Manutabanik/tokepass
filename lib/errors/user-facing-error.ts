import {
  APP_ERRORS,
  containsInternalErrorCode,
  isSafeUserFacingCopy,
  mapUnknownError,
} from "@/lib/errors/error-handler"
import { isUnmaskedSupabaseError } from "@/lib/errors/supabase-error"

export const INVENTORY_SYNC_MESSAGE = APP_ERRORS.INVENTORY_SYNC.message

export const GENERIC_PUBLIC_ERROR =
  "Tuvimos un problema técnico de nuestro lado. Volvé a intentar en un ratito"

export { containsInternalErrorCode, isSafeUserFacingCopy, mapUnknownError }

export function toUserFacingError(
  text: unknown,
  fallback = INVENTORY_SYNC_MESSAGE,
): string {
  if (isUnmaskedSupabaseError(text)) return text
  const safeFallback = isSafeUserFacingCopy(fallback)
    ? fallback
    : GENERIC_PUBLIC_ERROR
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
