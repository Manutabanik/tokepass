import { parseCartCompositeItemId } from "@/lib/checkout/cart-item-identity"
import { CHECKOUT_PRICES_CHANGED_ERROR } from "@/lib/checkout/price-guard"
import {
  GENERAL_STOCK_UNAVAILABLE,
  SEAT_SELECTION_REQUIRED,
  SEAT_UNAVAILABLE,
  SECTOR_NOT_CONFIGURED,
  isCheckoutStockConflict,
  isSeatSelectionRequiredError,
  isSeatUnavailableError,
  isSectorNotConfiguredError,
  parseGeneralStockParts,
} from "@/lib/checkout/revalidate-seat-holds"

export const CHECKOUT_FEEDBACK_CODE = {
  ERR_NO_STOCK: "ERR_NO_STOCK",
  ERR_SEAT_TAKEN: "ERR_SEAT_TAKEN",
  ERR_SEAT_REQUIRED: "ERR_SEAT_REQUIRED",
  ERR_SECTOR_NOT_CONFIGURED: "ERR_SECTOR_NOT_CONFIGURED",
  ERR_AUTH: "ERR_AUTH",
  ERR_PRICE_CHANGED: "ERR_PRICE_CHANGED",
  ERR_GENERIC: "ERR_GENERIC",
} as const

export type CheckoutFeedbackCode =
  (typeof CHECKOUT_FEEDBACK_CODE)[keyof typeof CHECKOUT_FEEDBACK_CODE]

export type CheckoutFeedback = {
  code: CheckoutFeedbackCode | string
  message: string
  inlineMessage: string
  ticketId?: string
  ticketName?: string
}

export type CheckoutActionFailure = {
  success: false
  error: string
  code?: string
  ticketId?: string
}

export const CHECKOUT_NO_STOCK_TOAST =
  "Ups, no hay suficiente stock. Ajustá la cantidad resaltada."
export const CHECKOUT_NO_STOCK_INLINE =
  "Stock insuficiente para la cantidad seleccionada."
export const CHECKOUT_NO_STOCK_MESSAGE =
  "Stock insuficiente para esta entrada."
export const CHECKOUT_GENERIC_TOAST =
  "Ocurrió un problema al procesar tu selección. Intentá de nuevo."
export const CHECKOUT_TOAST_ERROR_STYLE = {
  background: "#18181b",
  color: "#f87171",
  borderColor: "#7f1d1d",
} as const

export function checkoutActionFailure(
  code: string,
  message: string,
  ticketId?: string | null,
): CheckoutActionFailure {
  return {
    success: false,
    error: message,
    code,
    ...(ticketId?.trim() ? { ticketId: ticketId.trim() } : {}),
  }
}

export function resolveCheckoutFeedback(
  error: string,
  extras?: { code?: string | null; ticketId?: string | null },
): CheckoutFeedback {
  const stock = parseGeneralStockParts(error)
  const ticketId = extras?.ticketId?.trim() || stock?.ticketId
  const ticketName = stock?.name
  const explicit = extras?.code?.trim()

  if (
    explicit === CHECKOUT_FEEDBACK_CODE.ERR_PRICE_CHANGED ||
    error === CHECKOUT_PRICES_CHANGED_ERROR ||
    /total de la orden no coincide con el precio vigente/i.test(error) ||
    /no se pudo cotizar el precio vigente/i.test(error) ||
    /precios o el inventario han sido actualizados/i.test(error)
  ) {
    return {
      code: CHECKOUT_FEEDBACK_CODE.ERR_PRICE_CHANGED,
      message: CHECKOUT_PRICES_CHANGED_ERROR,
      inlineMessage: CHECKOUT_PRICES_CHANGED_ERROR,
      ticketId,
      ticketName,
    }
  }

  if (error === "auth_required" || explicit === CHECKOUT_FEEDBACK_CODE.ERR_AUTH) {
    return {
      code: CHECKOUT_FEEDBACK_CODE.ERR_AUTH,
      message: "Ingresá para continuar. Tu selección está guardada.",
      inlineMessage: "",
      ticketId,
      ticketName,
    }
  }

  if (
    explicit === CHECKOUT_FEEDBACK_CODE.ERR_SEAT_REQUIRED ||
    error === SEAT_SELECTION_REQUIRED ||
    isSeatSelectionRequiredError(error)
  ) {
    return {
      code: CHECKOUT_FEEDBACK_CODE.ERR_SEAT_REQUIRED,
      message: "Debes seleccionar un asiento o mesa en el mapa antes de continuar.",
      inlineMessage: "Elegí un lugar en el mapa para continuar.",
      ticketId,
      ticketName,
    }
  }

  if (
    explicit === CHECKOUT_FEEDBACK_CODE.ERR_SEAT_TAKEN ||
    error === SEAT_UNAVAILABLE ||
    isSeatUnavailableError(error)
  ) {
    return {
      code: CHECKOUT_FEEDBACK_CODE.ERR_SEAT_TAKEN,
      message:
        "La mesa elegida acaba de ser reservada por otro comprador. Por favor, selecciona otra en el mapa.",
      inlineMessage: "Ese lugar ya no está disponible.",
      ticketId,
      ticketName,
    }
  }

  if (
    explicit === CHECKOUT_FEEDBACK_CODE.ERR_SECTOR_NOT_CONFIGURED ||
    error === SECTOR_NOT_CONFIGURED ||
    isSectorNotConfiguredError(error)
  ) {
    return {
      code: CHECKOUT_FEEDBACK_CODE.ERR_SECTOR_NOT_CONFIGURED,
      message: "Esta ubicación no está disponible temporalmente por mantenimiento",
      inlineMessage: "Esta ubicación no está disponible por ahora.",
      ticketId,
      ticketName,
    }
  }

  const noStock =
    explicit === CHECKOUT_FEEDBACK_CODE.ERR_NO_STOCK ||
    error === "out_of_stock" ||
    error === GENERAL_STOCK_UNAVAILABLE ||
    stock != null ||
    isCheckoutStockConflict(error)

  if (noStock) {
    return {
      code: CHECKOUT_FEEDBACK_CODE.ERR_NO_STOCK,
      message: CHECKOUT_NO_STOCK_TOAST,
      inlineMessage: CHECKOUT_NO_STOCK_INLINE,
      ticketId,
      ticketName,
    }
  }

  const detail = error.trim()
  return {
    code: explicit || CHECKOUT_FEEDBACK_CODE.ERR_GENERIC,
    message: detail || CHECKOUT_GENERIC_TOAST,
    inlineMessage: "",
    ticketId,
    ticketName,
  }
}

export function inferCheckoutTicketId(
  feedback: CheckoutFeedback,
  tiers: ReadonlyArray<{ id: string; name: string; seatingSectorId?: string | null }>,
  quantities: Record<string, number> = {},
): string | null {
  if (feedback.ticketId) {
    const direct = tiers.find(
      (tier) =>
        tier.id === feedback.ticketId ||
        tier.seatingSectorId === feedback.ticketId,
    )
    if (direct) return direct.id
    return feedback.ticketId
  }
  const name = feedback.ticketName?.trim().toLowerCase()
  if (name) {
    const match = tiers.find(
      (tier) => tier.name.trim().toLowerCase() === name,
    )
    if (match) return match.id
  }
  const selected = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([id]) => parseCartCompositeItemId(id)?.ticketId ?? id)
  const unique = [...new Set(selected)]
  if (unique.length === 1) return unique[0] ?? null
  return null
}
