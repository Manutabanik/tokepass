/** Postgres 55P03 / 40P01: el mutex del evento esta ocupado, no es sold-out. */
export const HIGH_DEMAND_LOCK_TIMEOUT = "HIGH_DEMAND_LOCK_TIMEOUT"

export const HIGH_DEMAND_LOCK_MESSAGE =
  "Hay alta demanda en este sector. Estamos procesando tu lugar, por favor reintenta en unos segundos."

export function reserveRpcErrorText(error: {
  message?: string | null
  code?: string | null
} | null | undefined): string {
  return `${error?.code ?? ""} ${error?.message ?? ""}`.trim()
}

export function isHighDemandLockError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("55p03") ||
    normalized.includes("lock_not_available") ||
    normalized.includes("lock timeout") ||
    normalized.includes("canceling statement due to lock timeout") ||
    normalized.includes("cancelling statement due to lock timeout") ||
    normalized.includes("40p01") ||
    normalized.includes("deadlock")
  )
}

export function isHighDemandRpcError(error: {
  message?: string | null
  code?: string | null
} | null | undefined): boolean {
  return isHighDemandLockError(reserveRpcErrorText(error))
}
