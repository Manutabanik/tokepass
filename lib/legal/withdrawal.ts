export const WITHDRAWAL_DAYS = 10
export const WITHDRAWAL_MIN_HOURS_BEFORE_EVENT = 24

const DAY_MS = 24 * 60 * 60 * 1000

export function isWithinWithdrawalWindow(
  paidAt: Date | string,
  now: Date = new Date(),
): boolean {
  const paid = paidAt instanceof Date ? paidAt : new Date(paidAt)
  if (Number.isNaN(paid.getTime())) return false
  return now.getTime() - paid.getTime() <= WITHDRAWAL_DAYS * DAY_MS
}

export function isEventFarEnoughForWithdrawal(
  eventStart: Date | string,
  now: Date = new Date(),
): boolean {
  const start = eventStart instanceof Date ? eventStart : new Date(eventStart)
  if (Number.isNaN(start.getTime())) return false
  return start.getTime() - now.getTime() >= WITHDRAWAL_MIN_HOURS_BEFORE_EVENT * 60 * 60 * 1000
}

export function normalizeWithdrawalEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isLocallyRefundablePayment(input: {
  paymentMethod?: string | null
  mpPaymentId?: string | null
}): boolean {
  const method = String(input.paymentMethod ?? "").trim()
  const paymentId = String(input.mpPaymentId ?? "").trim()
  if (paymentId.startsWith("free:") || method === "test_sandbox") return true
  if (method === "cash_pos" || method === "transfer_pos") return true
  return !paymentId && method !== "mercadopago"
}

export function isGatewayRefundSuccess(result: {
  success: boolean
  mode: string
}): boolean {
  return result.success && result.mode !== "mock"
}
