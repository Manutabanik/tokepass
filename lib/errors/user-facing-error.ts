import {
  APP_ERRORS,
  containsInternalErrorCode,
  isSafeUserFacingCopy,
  mapUnknownError,
} from "@/lib/errors/error-handler"

export const INVENTORY_SYNC_MESSAGE = APP_ERRORS.INVENTORY_SYNC.message

export const GENERIC_PUBLIC_ERROR =
  "No pudimos completar la operación. Intentá de nuevo."

export { containsInternalErrorCode, isSafeUserFacingCopy, mapUnknownError }

export function toUserFacingError(
  text: unknown,
  fallback = INVENTORY_SYNC_MESSAGE,
): string {
  const safeFallback = isSafeUserFacingCopy(fallback)
    ? fallback
    : GENERIC_PUBLIC_ERROR
  const message = mapUnknownError(text, {
    code: "INVENTORY_SYNC",
    message: safeFallback,
  }).message
  return isSafeUserFacingCopy(message) ? message : safeFallback
}
