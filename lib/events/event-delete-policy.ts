export const EVENT_HAS_CONFIRMED_SALES_ERROR =
  "Este evento tiene ventas confirmadas. No se puede eliminar. Solicitá la cancelación a soporte para iniciar el reembolso."

export const EVENT_ALREADY_DELETED_ERROR = "El evento ya está eliminado."

const CONFIRMED_TICKET_STATUSES = new Set([
  "valid",
  "used",
  "scanned",
  "transferred",
])

export function isConfirmedSaleTicketStatus(status: string | null | undefined): boolean {
  return CONFIRMED_TICKET_STATUSES.has((status ?? "").trim())
}

export function eventSoftDeleteDecision(input: {
  isDeleted?: boolean
  paidOrders: number
  confirmedTickets: number
}):
  | { ok: false; error: string }
  | { ok: true; mode: "deleted" } {
  if (input.isDeleted) {
    return { ok: false, error: EVENT_ALREADY_DELETED_ERROR }
  }
  if (input.paidOrders > 0 || input.confirmedTickets > 0) {
    return { ok: false, error: EVENT_HAS_CONFIRMED_SALES_ERROR }
  }
  return { ok: true, mode: "deleted" }
}
