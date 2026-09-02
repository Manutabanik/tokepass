import type {
  GENERAL_STOCK_UNAVAILABLE,
  SEAT_SELECTION_REQUIRED,
  SEAT_UNAVAILABLE,
  SECTOR_NOT_CONFIGURED,
} from "@/lib/checkout/revalidate-seat-holds"
import type { PhaseRolloverInfo } from "@/lib/inventory/active-phase"
import type { createClient } from "@/lib/supabase/server"

/** Cliente Supabase con el que corren las lecturas/escrituras de checkout. */
export type CheckoutSupabase = Awaited<ReturnType<typeof createClient>>

export type CheckoutEventAccess =
  | {
      ok: true
      useSandbox: boolean
      db: CheckoutSupabase
      eventId: string
      eventSlug: string | null
    }
  | { ok: false; error: string }

export type HoldOwner =
  | { ok: true; ownerId: string; userId: string | null; useAdmin: boolean }
  | { ok: false; error: "auth_required" }

export type ReservedTicket = {
  ticket_id: string
}

export type CheckoutResult =
  | {
      success: true
      tickets: ReservedTicket[]
      orderId: string
      initPoint: string
      paymentUrl: string
      /** ISO fin del hold (15m desde P203). Fuente de verdad UX del countdown. */
      expiresAt: string
      reservedUntil?: string
    }
  | {
      success: false
      error:
        | "auth_required"
        | "out_of_stock"
        | "phase_rollover"
        | typeof SECTOR_NOT_CONFIGURED
        | string
      code?: string
      ticketId?: string
      phaseRollover?: PhaseRolloverInfo
    }

/** Fila devuelta por los RPC transaccionales de reserva. */
export type ReserveTxRow = {
  order_id: string
  ticket_id: string
  subtotal: number
  service_charge: number
  total_amount: number
  reserved_until?: string
}

/** Fila devuelta por los RPC de reserva atómica (GA + mapeado). */
export type AtomicReserveRow = {
  reservation_id: string
  order_id: string
  phase_id: string | null
  ticket_id: string
  unit_price: number
  quantity: number
}

/**
 * Fila de `ticket_tiers` para resolver comercialización del carrito. Las
 * columnas son opcionales porque el select degrada progresivamente cuando el
 * schema todavía no tiene `ticket_type` / `tier_type` / `category`.
 */
export type CheckoutTierCommerceRow = {
  id: string
  name?: string | null
  seating_sector_id?: string | null
  layout_type?: string | null
  tier_type?: string | null
  category?: string | null
  ticket_type?: string | null
  min_purchase_limit?: number | null
  max_purchase_limit?: number | null
}

export type CartSeatingHoldResult =
  | { success: true; reservedUntil: string }
  | { success: false; error: "auth_required" | "out_of_stock" | "not_materialized" | string }

/** Fila cruda de hold por layout item, tal como la devuelve la DB. */
export type LayoutHoldDbRow = {
  id: string
  status: string
  sector_id: string
  event_date_id?: string | null
  ticket_tiers?:
    | { day_id?: string | null }
    | Array<{ day_id?: string | null }>
    | null
}

export type LockTicketsItem = {
  type?: "general" | "mapped"
  ticket_type_id?: string
  ticket_tier_id?: string
  ticketTierId?: string
  tierId?: string
  quantity: number
  seatingUnitId?: string
  seat_id?: string
  seatingIds?: string[]
  sector_id?: string | null
}

export type LockTicketsResult =
  | { success: true; reservedUntil: string }
  | {
      success: false
      error:
        | "auth_required"
        | "out_of_stock"
        | typeof SECTOR_NOT_CONFIGURED
        | typeof SEAT_SELECTION_REQUIRED
        | typeof SEAT_UNAVAILABLE
        | typeof GENERAL_STOCK_UNAVAILABLE
        | string
      code?: string
      ticketId?: string
    }

export type CartHoldListRow = {
  hold_kind: string
  tier_id: string
  quantity: number
  seating_unit_id: string | null
  layout_item_id: string | null
  label: string | null
  reserved_until: string
}

export type CreateCheckoutPreferenceInput = {
  eventId: string
  ticketTypeId: string
  quantity: number
  /** Ignorado: el precio lo congela el servidor (All-In). */
  unitPrice?: number
  buyerEmail?: string | null
  buyerName?: string | null
  buyerDni?: string | null
  referralCode?: string | null
}
