
import {
  SEAT_HOLD_EXPIRED_ERROR,
} from "@/lib/checkout-hold"
import {
  ERR_NO_STOCK,
  ERR_SEAT_TAKEN,
  GENERAL_STOCK_UNAVAILABLE,
  SEAT_SELECTION_REQUIRED,
  SEAT_UNAVAILABLE,
  SECTOR_NOT_CONFIGURED,
  isCheckoutInfrastructureError,
  isSeatSelectionRequiredError,
} from "@/lib/checkout/revalidate-seat-holds"
import {
  MISSING_EVENT_DATE_ID,
} from "@/lib/checkout/seat-hold-day"
import {
  HIGH_DEMAND_LOCK_TIMEOUT,
  isHighDemandLockError,
} from "@/lib/checkout/lock-timeout"
import {
  LEGAL_CONSENT_REQUIRED_ERROR,
} from "@/lib/legal/terms"
import type {
  CheckoutResult,
} from "@/lib/modules/checkout/types/checkout.types"
import {
  EVENT_FINISHED_ERROR,
  EVENT_SOLD_OUT_ERROR,
} from "@/lib/modules/checkout/constants/checkout-errors"

export function mapReserveRpcError(
  message: string,
): Extract<CheckoutResult, { success: false }> | null {
  if (/missing_event_date_id/i.test(message)) {
    return { success: false, error: MISSING_EVENT_DATE_ID }
  }

  if (/seat_hold_expired|seat_hold_session/i.test(message)) {
    return { success: false, error: SEAT_HOLD_EXPIRED_ERROR }
  }

  if (isHighDemandLockError(message)) {
    return { success: false, error: HIGH_DEMAND_LOCK_TIMEOUT }
  }

  const normalized = message.toLowerCase()

  if (isCheckoutInfrastructureError(message)) {
    return null
  }

  if (normalized.includes("finalizado")) {
    return { success: false, error: EVENT_FINISHED_ERROR }
  }

  if (normalized.includes("max_tickets_per_user")) {
    return {
      success: false,
      error:
        "Alcanzaste el máximo de entradas por persona para este evento.",
    }
  }

  if (
    normalized.includes("tier_purchase_max_exceeded") ||
    normalized.includes("tier_purchase_min_exceeded")
  ) {
    return {
      success: false,
      error: message.replace(/^TIER_PURCHASE_(MAX|MIN)_EXCEEDED:\s*/i, ""),
    }
  }

  if (normalized.includes("promo_max_uses")) {
    return {
      success: false,
      error: "Este cupón agotó sus usos.",
    }
  }

  if (normalized.includes("buyer_denylisted")) {
    return {
      success: false,
      error:
        "Esta identidad no puede comprar entradas. Si crees que es un error, escribinos a soporte.",
    }
  }

  if (normalized.includes("legal_consent")) {
    return { success: false, error: LEGAL_CONSENT_REQUIRED_ERROR }
  }

  if (
    normalized.includes("seating_unit_not_materialized") ||
    normalized.includes("seating_sector_empty") ||
    normalized.includes("seating_sector_not_found") ||
    normalized.includes("seating_layout_not_found") ||
    normalized.includes("seating_layout_type_mismatch") ||
    normalized.includes("sector_not_configured")
  ) {
    return { success: false, error: SECTOR_NOT_CONFIGURED }
  }

  if (
    normalized.includes("seat_selection_required") ||
    isSeatSelectionRequiredError(message)
  ) {
    return { success: false, error: SEAT_SELECTION_REQUIRED }
  }

  if (
    normalized.includes("seat_unavailable") ||
    normalized.includes("seating_unit_unavailable")
  ) {
    return {
      success: false,
      error: SEAT_UNAVAILABLE,
      code: ERR_SEAT_TAKEN,
    }
  }

  if (
    normalized.includes("general_stock_unavailable") ||
    normalized.includes("err_no_stock")
  ) {
    return {
      success: false,
      error: GENERAL_STOCK_UNAVAILABLE,
      code: ERR_NO_STOCK,
    }
  }

  if (
    normalized.includes("inventory_conflict_409") ||
    normalized.includes("409") ||
    normalized.includes("conflict")
  ) {
    return { success: false, error: "out_of_stock", code: ERR_NO_STOCK }
  }

  if (
    normalized.includes("bundle_child_unavailable") ||
    normalized.includes("bundle_child_invalid_or_exhausted")
  ) {
    return { success: false, error: "out_of_stock", code: ERR_NO_STOCK }
  }

  if (normalized.includes("agotad")) {
    return { success: false, error: EVENT_SOLD_OUT_ERROR }
  }

  if (
    isCheckoutInfrastructureError(message) ||
    /could not find the function|function .+ does not exist|pgrst202|schema cache/i.test(
      normalized,
    )
  ) {
    return null
  }

  if (
    normalized.includes("sold out") ||
    normalized.includes("out_of_stock") ||
    normalized.includes("err_no_stock") ||
    normalized.includes("sin stock") ||
    normalized.includes("stock insuficiente") ||
    /(^|[^a-z_])stock([^a-z_]|$)/.test(normalized) ||
    normalized.includes("capacity") ||
    normalized.includes("recinto") ||
    normalized.includes("física") ||
    normalized.includes("fisica") ||
    normalized.includes("not published") ||
    normalized.includes("not found")
  ) {
    return { success: false, error: "out_of_stock", code: ERR_NO_STOCK }
  }

  return null
}

