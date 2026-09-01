export const EVENT_HAS_CONFIRMED_SALES_ERROR =
  "Este evento tiene ventas confirmadas. No se puede eliminar. Solicitá la cancelación a soporte para iniciar el reembolso."

export const EVENT_ALREADY_DELETED_ERROR = "El evento ya está eliminado."

export const EVENT_PUBLISHED_MUST_REQUEST_CANCEL_ERROR =
  "Un evento publicado no se puede eliminar. Pedí la cancelación para que Super Admin evalúe los reembolsos."

export const EVENT_CANCELLATION_REASON_ERROR =
  "Escribí un motivo de al menos 12 caracteres."

export const EVENT_CANCELLATION_STATUS_ERROR =
  "Solo se puede pedir la cancelación de un evento publicado o pausado."

export const EVENT_CANCELLATION_ALREADY_REQUESTED_ERROR =
  "Ya hay una solicitud de cancelación en curso."

const SOFT_DELETE_STATUSES = new Set([
  "draft",
  "pending_approval",
  "needs_revision",
  "rejected",
  "archived",
])

const CANCELLATION_REQUEST_STATUSES = new Set(["published", "paused"])

export function canOrganizerSoftDeleteStatus(
  status: string | null | undefined,
): boolean {
  return SOFT_DELETE_STATUSES.has((status ?? "").trim())
}

export function canOrganizerRequestCancellation(
  status: string | null | undefined,
): boolean {
  return CANCELLATION_REQUEST_STATUSES.has((status ?? "").trim())
}

export function eventCancellationRequestDecision(input: {
  status: string | null | undefined
  reason: string
}): { ok: true } | { ok: false; error: string } {
  const status = (input.status ?? "").trim()
  if (status === "cancellation_requested") {
    return { ok: false, error: EVENT_CANCELLATION_ALREADY_REQUESTED_ERROR }
  }
  if (!canOrganizerRequestCancellation(status)) {
    return { ok: false, error: EVENT_CANCELLATION_STATUS_ERROR }
  }
  if (input.reason.trim().length < 12) {
    return { ok: false, error: EVENT_CANCELLATION_REASON_ERROR }
  }
  return { ok: true }
}

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
  status?: string | null
  paidOrders: number
  confirmedTickets: number
}):
  | { ok: false; error: string }
  | { ok: true; mode: "deleted" } {
  if (input.isDeleted) {
    return { ok: false, error: EVENT_ALREADY_DELETED_ERROR }
  }
  if (input.status && !canOrganizerSoftDeleteStatus(input.status)) {
    return { ok: false, error: EVENT_PUBLISHED_MUST_REQUEST_CANCEL_ERROR }
  }
  if (input.paidOrders > 0 || input.confirmedTickets > 0) {
    return { ok: false, error: EVENT_HAS_CONFIRMED_SALES_ERROR }
  }
  return { ok: true, mode: "deleted" }
}
