import { parseDateTimeLocal, toDatetimeLocalInput } from "@/lib/event-schedule"
import { formatDateTime } from "@/lib/format"

export const TICKET_SALE_ENDED_ERROR = "Esta preventa ya finalizó."
export const TICKET_SALE_UPCOMING_ERROR =
  "Esta preventa todavía no está disponible."

export type TicketSaleKind = "active" | "upcoming" | "ended" | "sold_out"

export type TicketSaleState =
  | { kind: "sold_out" }
  | { kind: "upcoming"; startsAt: string }
  | { kind: "ended"; endedAt: string }
  | { kind: "active" }

export function parseSaleInstant(
  value: string | Date | null | undefined,
): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  return parseDateTimeLocal(trimmed)
}

export function saleWindowToIso(
  value: string | Date | null | undefined,
): string | null {
  const date = parseSaleInstant(value)
  return date ? date.toISOString() : null
}

export function saleWindowToFormValue(
  value: string | Date | null | undefined,
): string {
  const date = parseSaleInstant(value)
  return date ? toDatetimeLocalInput(date) : ""
}

export function resolveTicketSaleState(input: {
  available?: number | null
  capacity?: number | null
  sold?: number | null
  saleStartsAt?: string | Date | null
  saleEndsAt?: string | Date | null
  now?: Date | number
}): TicketSaleState {
  const nowMs =
    input.now instanceof Date
      ? input.now.getTime()
      : typeof input.now === "number"
        ? input.now
        : Date.now()
  const capacity = Number(input.capacity)
  const sold = Number(input.sold)
  const available =
    input.available == null
      ? Number.isFinite(capacity) && Number.isFinite(sold)
        ? capacity - sold
        : undefined
      : Number(input.available)
  if (
    (Number.isFinite(available) && (available as number) <= 0) ||
    (Number.isFinite(capacity) &&
      Number.isFinite(sold) &&
      capacity > 0 &&
      sold >= capacity)
  ) {
    return { kind: "sold_out" }
  }

  const start = parseSaleInstant(input.saleStartsAt)
  const end = parseSaleInstant(input.saleEndsAt)
  if (start && nowMs < start.getTime()) {
    return { kind: "upcoming", startsAt: start.toISOString() }
  }
  if (end && nowMs > end.getTime()) {
    return { kind: "ended", endedAt: end.toISOString() }
  }
  return { kind: "active" }
}

export function ticketSaleWindowLabel(state: TicketSaleState): string | null {
  if (state.kind === "sold_out") return "Agotado"
  if (state.kind === "upcoming") {
    return `Disponible a partir del ${formatDateTime(state.startsAt)}`
  }
  if (state.kind === "ended") return "Preventa finalizada"
  return null
}

export function ticketSaleWindowError(state: TicketSaleState): string | null {
  if (state.kind === "upcoming") return TICKET_SALE_UPCOMING_ERROR
  if (state.kind === "ended") return TICKET_SALE_ENDED_ERROR
  return null
}

export function isTicketOnSale(state: TicketSaleState): boolean {
  return state.kind === "active"
}

export function isMissingSaleWindowSchema(message: string): boolean {
  return /sale_starts_at|sale_ends_at|schema cache|PGRST204|42703/i.test(
    message,
  )
}
