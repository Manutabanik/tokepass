/**
 * Contrato unificado para Server Actions / API mutations.
 */
export type ActionResult<T = undefined> =
  | (T extends undefined
      ? { success: true; data?: undefined }
      : { success: true; data: T })
  | { success: false; error: string }

export function ok(): { success: true }
export function ok<T>(data: T): { success: true; data: T }
export function ok<T>(data?: T) {
  if (arguments.length === 0) return { success: true as const }
  return { success: true as const, data }
}

export function fail(error: string): { success: false; error: string } {
  return { success: false, error }
}
