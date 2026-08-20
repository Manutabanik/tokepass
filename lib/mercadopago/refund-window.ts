/** Ventana oficial de reembolsos MP (Argentina): 180 dias desde la aprobacion. */
export const MERCADO_PAGO_REFUND_WINDOW_DAYS = 180

export function parseMercadoPagoPaidAt(
  value: Date | string | number | null | undefined,
): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

export function isWithinMercadoPagoRefundWindow(
  paidAt: Date | string | number | null | undefined,
  now: Date = new Date(),
  windowDays = MERCADO_PAGO_REFUND_WINDOW_DAYS,
): boolean {
  const paid = parseMercadoPagoPaidAt(paidAt)
  if (!paid) return false
  const days = Number(windowDays)
  if (!Number.isFinite(days) || days < 0) return false
  const deadline = paid.getTime() + days * 24 * 60 * 60 * 1000
  return now.getTime() <= deadline
}
