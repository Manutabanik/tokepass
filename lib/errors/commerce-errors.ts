import { CHECKOUT_NO_STOCK_MESSAGE } from "@/lib/checkout/checkout-feedback"
import {
  MISSING_EVENT_DATE_ID,
  MISSING_EVENT_DATE_ID_MESSAGE,
} from "@/lib/checkout/seat-hold-day"
import {
  SEAT_SELECTION_REQUIRED,
  SEAT_UNAVAILABLE_MESSAGE,
  SECTOR_NOT_CONFIGURED,
  isBuyerSoldOutToast,
  isCheckoutConnectionNoise,
  isSeatSelectionRequiredError,
  isSeatUnavailableError,
  parseGeneralStockUnavailable,
} from "@/lib/checkout/revalidate-seat-holds"
import { GENERIC_PUBLIC_ERROR, toUserFacingError } from "@/lib/errors/user-facing-error"
import {
  TICKET_SALE_ENDED_ERROR,
  TICKET_SALE_UPCOMING_ERROR,
} from "@/lib/inventory/ticket-sale-window"

export const POS_GENERIC_ERROR = "No se pudo completar la venta."
export const CHECKOUT_GENERIC_ERROR =
  "Ocurrió un error al procesar tu solicitud"

const POS_RULES: Array<{ match: RegExp; message: string }> = [
  {
    match: /POS_EXTRAS_NOT_SOLD|extras no se venden/i,
    message:
      "Los extras no se venden como entrada. Cobrálos en la tienda del evento.",
  },
  {
    match: /sold out|agotad|sin stock|out_of_stock/i,
    message: "Sin stock para ese tipo de entrada.",
  },
  {
    match: /shift_required|abrir la caja/i,
    message: "Tenés que abrir la caja antes de cobrar.",
  },
  {
    match: /shift_invalid/i,
    message: "El turno de caja no es válido para esta operación.",
  },
  {
    match: /dni_required/i,
    message: "Ingresá el DNI del comprador para el respaldo en puerta.",
  },
  {
    match: /supervisor_pin/i,
    message: "PIN de Autorización inválido o no configurado.",
  },
  {
    match: /seating_not_found|seating_tier|seating_unit_unavailable/i,
    message: "Esa ubicación ya no está disponible. Recargá el mapa.",
  },
  {
    match: /missing_event_date_id/i,
    message: "Elegí el día del evento para cobrar esa ubicación.",
  },
  {
    match: /SEAT_SELECTION_REQUIRED|seat_selection_required/i,
    message: "Elegí una mesa o asiento en el plano para esa entrada.",
  },
  {
    match: /void_tickets_used/i,
    message: "No se puede anular: alguna entrada ya se usó en puerta.",
  },
  {
    match: /forbidden|permission denied/i,
    message: "No tenés permiso para esta acción.",
  },
  {
    match: /pin_invalid|22023/i,
    message: "El PIN de caja no es válido.",
  },
]

function textFromUnknown(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw === "string") return raw.trim()
  if (raw instanceof Error) return raw.message.trim()
  if (typeof raw === "object" && "message" in raw) {
    const message = (raw as { message?: unknown }).message
    if (typeof message === "string") return message.trim()
  }
  return ""
}

export function mapPosRpcError(raw: unknown): string | null {
  const text = textFromUnknown(raw)
  if (!text) return null
  for (const rule of POS_RULES) {
    if (rule.match.test(text)) return rule.message
  }
  return null
}

export function toPosUserError(
  raw: unknown,
  fallback = POS_GENERIC_ERROR,
): string {
  return mapPosRpcError(raw) ?? toUserFacingError(raw, fallback)
}

export function toCheckoutUserError(
  raw: unknown,
  fallback = CHECKOUT_GENERIC_ERROR,
): string {
  const text = textFromUnknown(raw)
  if (text === "auth_required" || text === "phase_rollover") return text
  if (text === MISSING_EVENT_DATE_ID || /missing_event_date_id/i.test(text)) {
    return MISSING_EVENT_DATE_ID_MESSAGE
  }
  if (text === TICKET_SALE_ENDED_ERROR || text === TICKET_SALE_UPCOMING_ERROR) {
    return text
  }
  if (text === SEAT_SELECTION_REQUIRED || isSeatSelectionRequiredError(text)) {
    return text
  }
  if (text === SECTOR_NOT_CONFIGURED) return text
  if (isSeatUnavailableError(text)) return SEAT_UNAVAILABLE_MESSAGE
  const generalStock = parseGeneralStockUnavailable(text)
  if (generalStock) return generalStock
  if (isCheckoutConnectionNoise(text)) {
    return "No se pudo reservar el stock. Probá de nuevo."
  }
  if (isBuyerSoldOutToast(text)) return CHECKOUT_NO_STOCK_MESSAGE
  return toUserFacingError(raw, fallback)
}

export function publicActionError(
  raw: unknown,
  fallback = GENERIC_PUBLIC_ERROR,
): { success: false; error: string } {
  return { success: false, error: toUserFacingError(raw, fallback) }
}
