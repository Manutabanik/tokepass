"use server"

import { revalidatePath } from "next/cache"

import { resolveCheckoutExpiresAt } from "@/lib/checkout-hold"
import { releaseWaitingRoomPassFromCookies } from "@/lib/waiting-room/release"
import {
  type CheckoutBuyerInfo,
  type NormalizedCheckoutBuyer,
} from "@/lib/checkout-buyer"
import {
  applyActivePhaseToTier,
  decidePhaseCart,
  isMissingPhasesSchema,
  isPhaseStockError,
  mapPublicPhaseRow,
  PHASE_ROLLOVER_MESSAGE,
  PHASE_STOCK_CLAMP_MESSAGE,
  type PhaseRolloverInfo,
  type PublicTicketPhase,
} from "@/lib/inventory/active-phase"
import { isPastEvent, isSoldOut } from "@/lib/event-status"
import { logger } from "@/lib/logger"
import { captureCriticalException } from "@/lib/sentry/capture"
import { getSiteUrl } from "@/lib/mercadopago"
import {
  PaymentProviderNotSupportedError,
  PaymentProviderUnavailableError,
} from "@/lib/payments/core/errors"
import { PaymentGatewayFactory } from "@/lib/payments/core/factory"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"
import { buildCheckoutBackUrls } from "@/lib/payments/mercadopago"
import {
  expireCheckoutPreferenceOnOrder,
  invalidateStaleCheckoutPreferences,
} from "@/lib/payments/stale-preferences"
import { issueCheckoutFulfillmentCookie } from "@/lib/checkout/fulfillment-cookie"
import {
  HIGH_DEMAND_LOCK_TIMEOUT,
  isHighDemandLockError,
  reserveRpcErrorText,
} from "@/lib/checkout/lock-timeout"
import { consumeRateLimit } from "@/lib/rate-limit"
import { getCheckoutRequestContext } from "@/lib/checkout/request-context"
import {
  CHECKOUT_BUSY_ERROR,
  assertGuestTicketCap,
  checkoutFailuresBlocked,
  persistCheckoutSecurityEvent,
  persistOrderCustomerPhone,
  persistOrderGuestToken,
  recordCheckoutFailure,
} from "@/lib/checkout/server-guards"
import { isValidCuit, normalizeCuit } from "@/lib/legal/argentina"
import {
  EVENT_LEGAL_TERMS_VERSION,
  LEGAL_CONSENT_REQUIRED_ERROR,
} from "@/lib/legal/terms"
import { normalizePreviewKey } from "@/lib/preview/sandbox"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { PaymentProvider } from "@/types/database"
import {
  amountsMatch,
  checkoutItemElementId,
  checkoutItemSeatId,
  checkoutItemTierId,
  isMappedCheckoutItem,
  quoteHybridCartTotal,
  toReserveRpcItem,
} from "@/lib/checkout/hybrid-cart"
import { toCheckoutUserError } from "@/lib/errors/commerce-errors"
import {
  CheckoutEventIdSchema,
  CheckoutLayoutHoldSchema,
  CheckoutLockTicketsSchema,
  CheckoutPayloadSchema,
  CheckoutSeatHoldSchema,
  buyerToHolderFields,
  formatCheckoutPayloadError,
  type CheckoutAddonItem,
  type CheckoutCartItem,
  type CheckoutCartItemInput,
} from "@/lib/validations/checkout"

const EVENT_FINISHED_ERROR = "El evento ya ha finalizado"
const EVENT_SOLD_OUT_ERROR = "El evento o sector se encuentra agotado"
const GENERIC_CHECKOUT_ERROR =
  "Ocurrió un error al procesar tu solicitud"

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
      /** ISO fin del hold (8m). Fuente de verdad UX del countdown. */
      expiresAt: string
      reservedUntil?: string
    }
  | {
      success: false
      error: "auth_required" | "out_of_stock" | "phase_rollover" | string
      phaseRollover?: PhaseRolloverInfo
    }

type ReserveTxRow = {
  order_id: string
  ticket_id: string
  subtotal: number
  service_charge: number
  total_amount: number
  reserved_until?: string
}

function mapReserveRpcError(message: string): CheckoutResult | null {
  if (isHighDemandLockError(message)) {
    return { success: false, error: HIGH_DEMAND_LOCK_TIMEOUT }
  }

  const normalized = message.toLowerCase()

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

  if (normalized.includes("legal_consent")) {
    return { success: false, error: LEGAL_CONSENT_REQUIRED_ERROR }
  }

  if (normalized.includes("seating_unit_not_materialized")) {
    return { success: false, error: "not_materialized" }
  }

  if (
    normalized.includes("seating_unit_unavailable") ||
    normalized.includes("inventory_conflict_409") ||
    normalized.includes("409") ||
    normalized.includes("conflict")
  ) {
    return { success: false, error: "out_of_stock" }
  }

  if (
    normalized.includes("bundle_child_unavailable") ||
    normalized.includes("bundle_child_invalid_or_exhausted")
  ) {
    return { success: false, error: "out_of_stock" }
  }

  if (normalized.includes("agotad")) {
    return { success: false, error: EVENT_SOLD_OUT_ERROR }
  }

  if (
    normalized.includes("sold out") ||
    normalized.includes("stock") ||
    normalized.includes("capacity") ||
    normalized.includes("recinto") ||
    normalized.includes("física") ||
    normalized.includes("fisica") ||
    normalized.includes("not published") ||
    normalized.includes("not found")
  ) {
    return { success: false, error: "out_of_stock" }
  }

  return null
}

type CheckoutSupabase = Awaited<ReturnType<typeof createClient>>

type CheckoutEventAccess =
  | { ok: true; useSandbox: boolean; db: CheckoutSupabase }
  | { ok: false; error: string }

async function resolveCheckoutEventAccess(input: {
  eventId: string
  userId: string
  previewKey?: string | null
}): Promise<CheckoutEventAccess> {
  const userClient = await createClient()
  const admin = createAdminClient() as CheckoutSupabase
  const { data: event } = await admin
    .from("events")
    .select("id, organizer_id, status")
    .eq("id", input.eventId)
    .maybeSingle()

  if (!event) {
    return { ok: false, error: "Evento no encontrado." }
  }

  if (event.status === "published") {
    return { ok: true, useSandbox: false, db: userClient }
  }

  if (event.status === "paused") {
    const { data: profile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", input.userId)
      .maybeSingle()
    const isStaff =
      event.organizer_id === input.userId || profile?.role === "super_admin"
    if (!isStaff) {
      return { ok: false, error: "Este evento no está en venta." }
    }
    return { ok: true, useSandbox: false, db: userClient }
  }

  if (event.status !== "draft") {
    return {
      ok: false,
      error: "Este evento no admite compras de prueba en su estado actual.",
    }
  }

  const key = normalizePreviewKey(input.previewKey)
  if (key) {
    const { data: matches } = await admin.rpc("event_preview_key_matches", {
      p_event_id: input.eventId,
      p_key: key,
    })
    if (matches) {
      return { ok: true, useSandbox: true, db: admin }
    }
  }

  const { data: profile } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", input.userId)
    .maybeSingle()
  const isStaff =
    event.organizer_id === input.userId || profile?.role === "super_admin"
  if (!isStaff) {
    return { ok: false, error: "Este evento no es público." }
  }

  return { ok: true, useSandbox: true, db: admin }
}

type AtomicReserveRow = {
  reservation_id: string
  order_id: string
  phase_id: string | null
  ticket_id: string
  unit_price: number
  quantity: number
}

async function loadCheckoutTierPhases(
  supabase: CheckoutSupabase,
  tierIds: string[],
): Promise<Map<string, PublicTicketPhase[]>> {
  const byTier = new Map<string, PublicTicketPhase[]>()
  if (tierIds.length === 0) return byTier

  const { data, error } = await supabase
    .from("ticket_tier_phases")
    .select(
      "id, tier_id, name, price, capacity_limit, sold, start_time, end_time, status",
    )
    .in("tier_id", tierIds)
    .order("start_time", { ascending: true, nullsFirst: false })

  if (error) {
    if (!isMissingPhasesSchema(error.message)) {
      logger.error({
        context: "checkout/phases",
        message: "ticket_phases_load_failed",
        error: error.message,
      })
    }
    return byTier
  }

  for (const row of data ?? []) {
    const list = byTier.get(row.tier_id) ?? []
    list.push(mapPublicPhaseRow(row))
    byTier.set(row.tier_id, list)
  }
  return byTier
}

function phaseRolloverResult(
  tierId: string,
  phase: PublicTicketPhase,
  available: number,
  message: string,
): CheckoutResult {
  return {
    success: false,
    error: "phase_rollover",
    phaseRollover: {
      tierId,
      phaseId: phase.id,
      phaseName: phase.name,
      price: phase.price,
      available: Math.max(0, available),
      message,
    },
  }
}

async function evaluateCartPhaseRollover(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
): Promise<CheckoutResult | null> {
  const quantityItems = items.filter((item) => !isMappedCheckoutItem(item))
  if (quantityItems.length === 0) return null

  const tierIds = [...new Set(quantityItems.map((item) => checkoutItemTierId(item)))]
  const [{ data: tierRows }, phasesByTier] = await Promise.all([
    supabase
      .from("ticket_tiers")
      .select("id, price, capacity, sold")
      .eq("event_id", eventId)
      .in("id", tierIds),
    loadCheckoutTierPhases(supabase, tierIds),
  ])

  const tierById = new Map((tierRows ?? []).map((row) => [row.id, row]))

  for (const item of quantityItems) {
    const tierId = checkoutItemTierId(item)
    const phases = phasesByTier.get(tierId) ?? []
    if (phases.length === 0) continue

    const tier = tierById.get(tierId)
    const tierAvailable = Math.max(
      0,
      Number(tier?.capacity ?? 0) - Number(tier?.sold ?? 0),
    )
    const decision = decidePhaseCart(phases, item.quantity)

    if (decision.kind === "ok") continue

    if (decision.kind === "sold_out") {
      return { success: false, error: EVENT_SOLD_OUT_ERROR }
    }

    if (decision.kind === "clamp") {
      const priced = applyActivePhaseToTier(
        { price: decision.phase.price, available: tierAvailable },
        [decision.phase],
      )
      return phaseRolloverResult(
        tierId,
        decision.phase,
        priced.available,
        PHASE_STOCK_CLAMP_MESSAGE,
      )
    }

    const priced = applyActivePhaseToTier(
      { price: decision.phase.price, available: tierAvailable },
      phases.map((phase) =>
        phase.id === decision.phase.id
          ? { ...phase, status: "active" as const }
          : phase.status === "active"
            ? { ...phase, status: "sold_out" as const }
            : phase,
      ),
    )
    return phaseRolloverResult(
      tierId,
      decision.phase,
      priced.available,
      PHASE_ROLLOVER_MESSAGE,
    )
  }

  return null
}

async function resolvePhaseRolloverAfterError(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
): Promise<CheckoutResult> {
  const rollover = await evaluateCartPhaseRollover(supabase, eventId, items)
  if (rollover) return rollover
  return { success: false, error: EVENT_SOLD_OUT_ERROR }
}

async function reserveGeneralAdmissionAtomic(
  supabase: CheckoutSupabase,
  input: {
    eventId: string
    ownerId: string
    tierId: string
    quantity: number
    phaseId?: string | null
    promoterId?: string | null
  },
) {
  const reservation = await supabase.rpc("reserve_tickets_atomic", {
    p_event_id: input.eventId,
    p_owner_id: input.ownerId,
    p_tier_id: input.tierId,
    p_quantity: input.quantity,
    p_phase_id: input.phaseId ?? null,
  })

  if (reservation.error && isMissingPhasesSchema(reservation.error.message)) {
    return { missing: true as const, reservation: null }
  }

  if (reservation.error || !reservation.data) {
    return { missing: false as const, reservation }
  }

  if (input.promoterId) {
    const orderId = reservation.data[0]?.order_id
    if (orderId) {
      const admin = createAdminClient()
      const { error: promoterError } = await admin
        .from("orders")
        .update({ promoter_id: input.promoterId })
        .eq("id", orderId)
        .eq("buyer_id", input.ownerId)
        .eq("status", "pending")
      if (promoterError) {
        logger.error({
          context: "checkout/reservation",
          message: "atomic_promoter_attach_failed",
          orderId,
          error: promoterError.message,
        })
      }
    }
  }

  return { missing: false as const, reservation }
}

async function resolveMappedSeatingUnits(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
): Promise<
  | { ok: true; items: CheckoutCartItem[] }
  | { ok: false; error: "out_of_stock" }
> {
  const next = items.map((item) => ({ ...item }))
  for (const item of next) {
    if (!isMappedCheckoutItem(item)) continue
    const existingSeat = checkoutItemSeatId(item)
    if (existingSeat) {
      item.seatingUnitId = existingSeat
      item.seatId = existingSeat
      item.seat_id = existingSeat
      continue
    }
    const elementId = checkoutItemElementId(item)
    if (!elementId) return { ok: false, error: "out_of_stock" }
    const { data } = await supabase
      .from("event_seating_units")
      .select("id")
      .eq("event_id", eventId)
      .eq("layout_item_id", elementId)
      .maybeSingle()
    if (!data?.id) return { ok: false, error: "out_of_stock" }
    item.seatingUnitId = data.id
    item.seatId = data.id
    item.seat_id = data.id
    item.elementId = elementId
    item.element_id = elementId
  }
  return { ok: true, items: next }
}

async function quoteCheckoutFromDatabase(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
  phasesByTier: Map<string, PublicTicketPhase[]>,
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const tierIds = [...new Set(items.map((item) => checkoutItemTierId(item)))]
  const unitPriceByTier = new Map<string, number>()

  for (const item of items) {
    const tierId = checkoutItemTierId(item)
    const { data, error } = await supabase.rpc("resolve_zone_tier_unit_price", {
      p_event_id: eventId,
      p_ticket_tier_id: tierId,
      p_sector_key: item.sectorKey ?? null,
      p_table_number: item.tableNumber ?? null,
      p_zone_id: item.zoneId ?? null,
    })
    if (error || data == null || !Number.isFinite(Number(data))) {
      const { data: tierRow } = await supabase
        .from("ticket_tiers")
        .select("price")
        .eq("id", tierId)
        .eq("event_id", eventId)
        .maybeSingle()
      const fallback = Number(tierRow?.price)
      if (!Number.isFinite(fallback) || fallback < 0) {
        return { ok: false, error: "No se pudo cotizar el precio vigente." }
      }
      unitPriceByTier.set(tierId, fallback)
      continue
    }
    unitPriceByTier.set(tierId, Number(data))
  }

  if (unitPriceByTier.size < tierIds.length) {
    return { ok: false, error: "No se pudo cotizar el precio vigente." }
  }

  return quoteHybridCartTotal({
    items,
    unitPriceByTier,
    phasesByTier,
  })
}

async function cleanupPendingOrder(orderId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.rpc("expire_abandoned_order", {
      p_order_id: orderId,
    })

    if (error) {
      logger.error({
        context: "checkout/cleanup",
        message: "pending_order_cleanup_failed",
        orderId,
        error: error.message,
      })
    }
  } catch (error) {
    captureCriticalException(error, "checkout/cleanup", { orderId })
    logger.error({
      context: "checkout/cleanup",
      message: "pending_order_cleanup_failed",
      orderId,
      error,
    })
  }
}

export type CartSeatingHoldResult =
  | { success: true; reservedUntil: string }
  | { success: false; error: "auth_required" | "out_of_stock" | "not_materialized" | string }

export async function holdSeatingUnitForCart(
  eventId: string,
  seatingUnitId: string,
  previewKey?: string | null,
): Promise<CartSeatingHoldResult> {
  const parsed = CheckoutSeatHoldSchema.safeParse({ eventId, seatingUnitId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId
  seatingUnitId = parsed.data.seatingUnitId

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  const access = await resolveCheckoutEventAccess({
    eventId,
    userId: user.id,
    previewKey,
  })
  if (!access.ok) {
    return { success: false, error: access.error }
  }
  const db = access.db

  const allowed = await consumeRateLimit({
    bucketKey: `cart-hold:user:${user.id}`,
    limit: 20,
    windowSeconds: 60,
  })
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Esperá un momento y volvé a elegir.",
    }
  }

  const { data: unitRow } = await db
    .from("event_seating_units")
    .select("status")
    .eq("id", seatingUnitId)
    .eq("event_id", eventId)
    .maybeSingle()
  if (unitRow && unitRow.status !== "available" && unitRow.status !== "reserved") {
    return { success: false, error: "out_of_stock" }
  }

  const { data, error } = await db.rpc("hold_seating_unit_for_cart", {
    p_event_id: eventId,
    p_owner_id: user.id,
    p_seating_unit_id: seatingUnitId,
  })

  if (error) {
    const mapped = mapReserveRpcError(reserveRpcErrorText(error))
    if (mapped) {
      return mapped.success
        ? { success: false, error: "out_of_stock" }
        : { success: false, error: mapped.error }
    }
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_seating_unit_for_cart_failed",
      eventId,
      seatingUnitId,
      error: error.message,
    })
    return {
      success: false,
      error: "No se pudo reservar esa ubicación. Elegí otra.",
    }
  }

  const row = Array.isArray(data) ? data[0] : data
  const reservedUntil = row?.reserved_until
  if (!reservedUntil) {
    return { success: false, error: "out_of_stock" }
  }

  return { success: true, reservedUntil }
}

export async function holdSeatingUnitForCartByLayoutItem(
  eventId: string,
  sectorId: string,
  layoutItemId: string,
  previewKey?: string | null,
): Promise<CartSeatingHoldResult & { seatingUnitId?: string }> {
  const parsed = CheckoutLayoutHoldSchema.safeParse({
    eventId,
    sectorId,
    layoutItemId,
  })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId
  sectorId = parsed.data.sectorId
  layoutItemId = parsed.data.layoutItemId

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  const access = await resolveCheckoutEventAccess({
    eventId,
    userId: user.id,
    previewKey,
  })
  if (!access.ok) {
    return { success: false, error: access.error }
  }
  const db = access.db

  const allowed = await consumeRateLimit({
    bucketKey: `cart-hold:user:${user.id}`,
    limit: 20,
    windowSeconds: 60,
  })
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Esperá un momento y volvé a elegir.",
    }
  }

  const { data: unitRow } = await db
    .from("event_seating_units")
    .select("status")
    .eq("event_id", eventId)
    .eq("layout_item_id", layoutItemId)
    .maybeSingle()
  if (unitRow && unitRow.status !== "available" && unitRow.status !== "reserved") {
    return { success: false, error: "out_of_stock" }
  }

  const { data, error } = await db.rpc(
    "hold_seating_unit_for_cart_by_layout" as never,
    {
      p_event_id: eventId,
      p_owner_id: user.id,
      p_sector_id: sectorId,
      p_layout_item_id: layoutItemId,
    } as never,
  )

  if (error) {
    const mapped = mapReserveRpcError(reserveRpcErrorText(error))
    if (mapped) {
      return mapped.success
        ? { success: false, error: "out_of_stock" }
        : { success: false, error: mapped.error }
    }
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_seating_unit_for_cart_by_layout_failed",
      eventId,
      sectorId,
      layoutItemId,
      error: error.message,
    })
    return {
      success: false,
      error: "No se pudo reservar esa ubicación. Elegí otra.",
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { reserved_until?: string; seating_unit_id?: string }
    | null
  const reservedUntil = row?.reserved_until
  const seatingUnitId = row?.seating_unit_id
  if (!reservedUntil || !seatingUnitId) {
    return { success: false, error: "not_materialized" }
  }

  return { success: true, reservedUntil, seatingUnitId }
}

export async function releaseSeatingUnitCartHold(
  eventId: string,
  seatingUnitId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = CheckoutSeatHoldSchema.safeParse({ eventId, seatingUnitId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId
  seatingUnitId = parsed.data.seatingUnitId

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  const { error } = await supabase.rpc("release_seating_unit_cart_hold", {
    p_event_id: eventId,
    p_owner_id: user.id,
    p_seating_unit_id: seatingUnitId,
  })
  if (error) {
    logger.error({
      context: "checkout/cart-hold",
      message: "release_seating_unit_cart_hold_failed",
      eventId,
      seatingUnitId,
      error: error.message,
    })
    return {
      success: false,
      error: toCheckoutUserError(error, "No se pudo liberar esa ubicación."),
    }
  }
  return { success: true }
}

export async function getSeatingUnitCartHold(
  eventId: string,
  seatingUnitId: string,
): Promise<CartSeatingHoldResult> {
  const parsed = CheckoutSeatHoldSchema.safeParse({ eventId, seatingUnitId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId
  seatingUnitId = parsed.data.seatingUnitId

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  const { data, error } = await supabase.rpc("get_seating_unit_cart_hold", {
    p_event_id: eventId,
    p_owner_id: user.id,
    p_seating_unit_id: seatingUnitId,
  })
  if (error) {
    return {
      success: false,
      error: toCheckoutUserError(error, "No se pudo consultar esa reserva."),
    }
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.reserved_until) {
    return { success: false, error: "out_of_stock" }
  }
  return { success: true, reservedUntil: row.reserved_until }
}

export type LockTicketsItem = {
  type?: "general" | "mapped"
  ticket_tier_id?: string
  ticketTierId?: string
  tierId: string
  quantity: number
}

export type LockTicketsResult =
  | { success: true; reservedUntil: string }
  | { success: false; error: "auth_required" | "out_of_stock" | string }

export async function lockTickets(
  eventId: string,
  items: LockTicketsItem[],
  previewKey?: string | null,
): Promise<LockTicketsResult> {
  const parsed = CheckoutLockTicketsSchema.safeParse({ eventId, items })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId
  items = parsed.data.items

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  const access = await resolveCheckoutEventAccess({
    eventId,
    userId: user.id,
    previewKey,
  })
  if (!access.ok) {
    return { success: false, error: access.error }
  }

  const allowed = await consumeRateLimit({
    bucketKey: `ga-hold:user:${user.id}`,
    limit: 20,
    windowSeconds: 60,
  })
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Esperá un momento y volvé a elegir.",
    }
  }

  const payload = items
    .filter((item) => item.type !== "mapped")
    .map((item) => {
      const tierId = (
        item.ticket_tier_id ||
        item.ticketTierId ||
        item.tierId
      ).trim()
      return {
        type: "general" as const,
        ticket_tier_id: tierId,
        tier_id: tierId,
        quantity: Math.max(0, Math.floor(item.quantity)),
      }
    })
    .filter((item) => item.tier_id.length > 0 && item.quantity > 0)

  if (payload.length === 0) {
    return { success: false, error: "out_of_stock" }
  }

  const { data, error } = await access.db.rpc("hold_ga_tickets_for_cart", {
    p_event_id: eventId,
    p_owner_id: user.id,
    p_items: payload,
  })

  if (error) {
    const mapped = mapReserveRpcError(reserveRpcErrorText(error))
    if (mapped) {
      return mapped.success
        ? { success: false, error: "out_of_stock" }
        : { success: false, error: mapped.error }
    }
    logger.error({
      context: "checkout/ga-hold",
      message: "hold_ga_tickets_for_cart_failed",
      eventId,
      error: error.message,
    })
    return {
      success: false,
      error: "No se pudo reservar el stock. Probá de nuevo.",
    }
  }

  const row = Array.isArray(data) ? data[0] : data
  const reservedUntil = row?.reserved_until
  if (!reservedUntil) {
    return { success: false, error: "out_of_stock" }
  }

  return { success: true, reservedUntil }
}

export async function releaseGaCartHolds(
  eventId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = CheckoutEventIdSchema.safeParse({ eventId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  const { error } = await supabase.rpc("release_ga_cart_holds", {
    p_event_id: eventId,
    p_owner_id: user.id,
  })
  if (error) {
    logger.error({
      context: "checkout/ga-hold",
      message: "release_ga_cart_holds_failed",
      eventId,
      error: error.message,
    })
    return {
      success: false,
      error: toCheckoutUserError(error, "No se pudo liberar el carrito."),
    }
  }
  return { success: true }
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

export async function listCartHolds(
  eventId: string,
): Promise<
  | { success: true; holds: CartHoldListRow[] }
  | { success: false; error: "auth_required" | string }
> {
  const parsed = CheckoutEventIdSchema.safeParse({ eventId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  const { data, error } = await supabase.rpc("list_cart_holds", {
    p_event_id: eventId,
    p_owner_id: user.id,
  })
  if (error) {
    const missing = /could not find|schema cache|does not exist/i.test(
      error.message,
    )
    if (missing) {
      return { success: false, error: "unavailable" }
    }
    return {
      success: false,
      error: toCheckoutUserError(error, "No se pudo leer el carrito."),
    }
  }

  const rows = (Array.isArray(data) ? data : data ? [data] : []) as CartHoldListRow[]
  return { success: true, holds: rows }
}

export async function getGaCartHold(
  eventId: string,
): Promise<LockTicketsResult> {
  const parsed = CheckoutEventIdSchema.safeParse({ eventId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  const { data, error } = await supabase.rpc("get_ga_cart_hold", {
    p_event_id: eventId,
    p_owner_id: user.id,
  })
  if (error) {
    return {
      success: false,
      error: toCheckoutUserError(error, "No se pudo consultar el carrito."),
    }
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.reserved_until) {
    return { success: false, error: "out_of_stock" }
  }
  return { success: true, reservedUntil: row.reserved_until }
}

async function persistOrderLegalGate(input: {
  orderId: string
  eventId: string
  buyerId: string
  sandbox: boolean
  termsAccepted: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.termsAccepted) {
    return { ok: false, error: LEGAL_CONSENT_REQUIRED_ERROR }
  }

  const admin = createAdminClient()
  const { data: event } = await admin
    .from("events")
    .select("organizer_id")
    .eq("id", input.eventId)
    .maybeSingle()

  const organizerId = event?.organizer_id ?? null
  let profile: {
    full_name: string | null
    public_name: string | null
    legal_name?: string | null
    tax_id?: string | null
  } | null = null
  let application: {
    company_name: string | null
    cuit_cuil: string | null
  } | null = null

  if (organizerId) {
    const [profileFull, applicationResult] = await Promise.all([
      admin
        .from("profiles")
        .select("full_name, public_name, legal_name, tax_id")
        .eq("id", organizerId)
        .maybeSingle(),
      admin
        .from("organizer_applications")
        .select("company_name, cuit_cuil")
        .eq("id", organizerId)
        .maybeSingle(),
    ])
    application = applicationResult.data
    if (profileFull.error && /legal_name|tax_id|column/i.test(profileFull.error.message)) {
      const fallback = await admin
        .from("profiles")
        .select("full_name, public_name")
        .eq("id", organizerId)
        .maybeSingle()
      profile = fallback.data
    } else {
      profile = profileFull.data
    }
  }

  const rawTaxId = profile?.tax_id ?? application?.cuit_cuil ?? ""
  const taxId = isValidCuit(rawTaxId) ? normalizeCuit(rawTaxId) : null
  const legalName =
    profile?.legal_name?.trim() ||
    application?.company_name?.trim() ||
    profile?.public_name?.trim() ||
    profile?.full_name?.trim() ||
    null

  const canRecord = Boolean(legalName && taxId)
  const patch = input.sandbox
    ? {
        is_test: true,
        legal_consent_required: false,
        ...(canRecord
          ? {
              terms_accepted: true,
              terms_accepted_at: new Date().toISOString(),
              legal_terms_version: EVENT_LEGAL_TERMS_VERSION,
              organizer_legal_name_snapshot: legalName,
              organizer_tax_id_snapshot: taxId,
            }
          : {}),
      }
    : canRecord
      ? {
          legal_consent_required: true,
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
          legal_terms_version: EVENT_LEGAL_TERMS_VERSION,
          organizer_legal_name_snapshot: legalName,
          organizer_tax_id_snapshot: taxId,
        }
      : { legal_consent_required: false }

  if (!input.sandbox && !canRecord) {
    logger.warn({
      context: "checkout/legal",
      message: "legal_identity_incomplete",
      orderId: input.orderId,
      eventId: input.eventId,
    })
  }

  const { error } = await admin
    .from("orders")
    .update(patch)
    .eq("id", input.orderId)
    .eq("buyer_id", input.buyerId)

  if (!error) return { ok: true }

  if (input.sandbox) {
    const fallback = await admin
      .from("orders")
      .update({ is_test: true })
      .eq("id", input.orderId)
      .eq("buyer_id", input.buyerId)
    if (fallback.error) {
      logger.error({
        context: "checkout/legal",
        message: "sandbox_legal_fallback_failed",
        orderId: input.orderId,
        error: fallback.error.message,
      })
    }
    return { ok: true }
  }

  if (/legal_|terms_accepted|column/i.test(error.message)) {
    logger.warn({
      context: "checkout/legal",
      message: "legal_columns_missing",
      orderId: input.orderId,
      error: error.message,
    })
    return { ok: true }
  }

  logger.error({
    context: "checkout/legal",
    message: "legal_consent_persist_failed",
    orderId: input.orderId,
    error: error.message,
  })
  return {
    ok: false,
    error: "No se pudo registrar la aceptación de términos.",
  }
}

async function applyHolderIdentityToOrder(input: {
  orderId: string
  buyer: NormalizedCheckoutBuyer
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("tickets")
    .update({
      holder_name: input.buyer.buyerName,
      holder_dni: input.buyer.buyerDni,
      holder_email: input.buyer.buyerEmail,
    })
    .eq("order_id", input.orderId)

  if (error) {
    logger.error({
      context: "checkout/holder",
      message: "holder_persist_failed",
      orderId: input.orderId,
      error: error.message,
    })
    // Columnas ausentes (migración P23 no aplicada): no bloquear el pago.
    if (/holder_/i.test(error.message) || /column/i.test(error.message)) {
      return { ok: true }
    }
    return {
      ok: false,
      error: "No se pudieron guardar los datos del asistente.",
    }
  }

  return { ok: true }
}

/**
 * Reserva tickets → crea orden pending → preferencia MP → URL de pago.
 * Si Mercado Pago falla, hace rollback de la reserva.
 */
export async function processCheckout(
  tierId: string,
  quantity: number,
  eventId: string,
  buyerInfo?: CheckoutBuyerInfo | null,
): Promise<CheckoutResult> {
  const parsed = CheckoutPayloadSchema.safeParse({
    eventId,
    items: [{ tierId, quantity }],
    buyer: buyerInfo,
  })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }

  return startCheckoutWithPayment(
    parsed.data.eventId,
    parsed.data.items ?? [
      {
        type: "general",
        ticket_tier_id: tierId,
        ticketTierId: tierId,
        tierId,
        quantity,
      },
    ],
    parsed.data.referralCode,
    parsed.data.addons,
    buyerToHolderFields(parsed.data.buyer),
    parsed.data.promoCodeId,
  )
}

const SEATING_COLLISION_MESSAGE =
  "Esta ubicación acaba de ser reservada por otra persona. Por favor elegí otra."

/**
 * Boundary for the numbered-seating checkout. Identity and tier ownership are
 * re-read on the server; the database RPC takes a row lock and conditionally
 * moves the unit from available to reserved for eight minutes.
 */
export async function reserveSeatAtomic(
  eventId: string,
  seatId: string,
  userId: string,
  referralCode?: string | null,
  buyer?: CheckoutBuyerInfo | null,
  promoCodeId?: string | null,
  paymentProvider?: SupportedPaymentProvider,
  security?: {
    captchaToken?: string | null
    deviceHash?: string | null
    dwellMs?: number | null
  },
): Promise<CheckoutResult> {
  const parsed = CheckoutPayloadSchema.safeParse({
    eventId,
    seatingIds: [seatId],
    buyer,
    referralCode,
    promoCodeId,
    paymentProvider,
  })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }

  const cleanEventId = parsed.data.eventId
  const cleanSeatId = parsed.data.seatingIds?.[0] ?? seatId.trim()
  const cleanUserId = userId.trim()

  if (!/^[0-9a-f-]{36}$/i.test(cleanUserId)) {
    return { success: false, error: "Datos de ubicación incompletos." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  if (user.id !== cleanUserId) {
    return { success: false, error: "No tenés permiso para esta reserva." }
  }

  const { data: unitRows, error: unitError } = await supabase.rpc(
    "get_event_seating_unit",
    {
      p_event_id: cleanEventId,
      p_unit_id: cleanSeatId,
    },
  )
  const unit = Array.isArray(unitRows) ? unitRows[0] : unitRows

  if (unitError || !unit || unit.status !== "available") {
    return { success: false, error: SEATING_COLLISION_MESSAGE }
  }

  const tableMatch = String(unit.label ?? "").match(/(\d+)/)
  const result = await startCheckoutWithPayment(
    cleanEventId,
    [
      {
        tierId: unit.tier_id,
        quantity: 1,
        seatingUnitId: unit.id,
        sectorKey: unit.sector_id,
        tableNumber: tableMatch ? Number(tableMatch[1]) : null,
      },
    ],
    parsed.data.referralCode,
    [],
    buyerToHolderFields(parsed.data.buyer),
    parsed.data.promoCodeId,
    { paymentProvider: parsed.data.paymentProvider, ...security },
  )

  if (!result.success && result.error === "out_of_stock") {
    return { success: false, error: SEATING_COLLISION_MESSAGE }
  }

  return result
}

export async function createComboReservation(
  eventId: string,
  bundleTierId: string,
  quantity: number,
  referralCode?: string | null,
  buyerInfo?: CheckoutBuyerInfo | null,
  promoCodeId?: string | null,
  options?: {
    sandbox?: boolean
    previewKey?: string | null
    paymentProvider?: SupportedPaymentProvider
  },
): Promise<CheckoutResult> {
  const parsed = CheckoutPayloadSchema.safeParse({
    eventId,
    items: [{ tierId: bundleTierId, quantity }],
    buyer: buyerInfo,
    referralCode,
    promoCodeId,
    sandbox: options?.sandbox,
    previewKey: options?.previewKey,
    paymentProvider: options?.paymentProvider,
  })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  const qty = parsed.data.items?.[0]?.quantity ?? Math.max(1, Math.floor(quantity) || 1)
  eventId = parsed.data.eventId
  bundleTierId = parsed.data.items?.[0]?.tierId ?? bundleTierId
  referralCode = parsed.data.referralCode
  promoCodeId = parsed.data.promoCodeId
  buyerInfo = buyerToHolderFields(parsed.data.buyer)
  const supabase = await createClient()
  const { data: bundle } = await supabase
    .from("ticket_tiers")
    .select("id, event_id, tier_type, category, capacity, sold, bundle_items")
    .eq("id", bundleTierId)
    .eq("event_id", eventId)
    .maybeSingle()

  if (!bundle) {
    return { success: false, error: "Combo no encontrado." }
  }

  const isBundle =
    bundle.tier_type === "bundle" || bundle.category === "bundle"
  if (!isBundle) {
    return { success: false, error: "Esa tarifa no es un combo." }
  }

  const available = Math.max(0, Number(bundle.capacity) - Number(bundle.sold))
  if (available < qty) {
    return { success: false, error: "out_of_stock" }
  }

  return startCheckoutWithPayment(
    eventId,
    [{ tierId: bundleTierId, quantity: qty }],
    referralCode,
    [],
    buyerInfo,
    promoCodeId,
    options,
  )
}

export async function startCheckoutWithPayment(
  eventId: string,
  items: CheckoutCartItemInput[],
  referralCode?: string | null,
  addons: CheckoutAddonItem[] = [],
  buyerInfo?: CheckoutBuyerInfo | null,
  promoCodeId?: string | null,
  options?: {
    sandbox?: boolean
    previewKey?: string | null
    paymentProvider?: SupportedPaymentProvider
    captchaToken?: string | null
    deviceHash?: string | null
    dwellMs?: number | null
    termsAccepted?: boolean
  },
): Promise<CheckoutResult> {
  const ctx = await getCheckoutRequestContext()
  if (await checkoutFailuresBlocked(ctx)) {
    return { success: false, error: CHECKOUT_BUSY_ERROR }
  }

  const parsed = CheckoutPayloadSchema.safeParse({
    eventId,
    items,
    seatingIds: items.flatMap((item) => {
      const ids = [...(item.seatingIds ?? [])]
      if (item.seatingUnitId) ids.push(item.seatingUnitId)
      return ids
    }),
    addons,
    buyer: buyerInfo,
    referralCode,
    promoCodeId,
    sandbox: options?.sandbox,
    termsAccepted: options?.termsAccepted,
    previewKey: options?.previewKey,
    paymentProvider: options?.paymentProvider,
  })
  if (!parsed.success) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }

  const payload = parsed.data
  const buyer = buyerToHolderFields(payload.buyer) satisfies NormalizedCheckoutBuyer

  const supabase = await createClient()
  const {
    data: { user: earlyUser },
    error: earlyAuthError,
  } = await supabase.auth.getUser()

  if (earlyAuthError || !earlyUser) {
    return { success: false, error: "auth_required" }
  }

  const access = await resolveCheckoutEventAccess({
    eventId: payload.eventId,
    userId: earlyUser.id,
    previewKey: payload.previewKey ?? options?.previewKey,
  })
  if (!access.ok) {
    return { success: false, error: access.error }
  }
  if (payload.sandbox && !access.useSandbox) {
    return {
      success: false,
      error:
        "Las compras de prueba solo están disponibles en eventos en borrador.",
    }
  }
  const db = access.db

  // Saneamos los items garantizando que 'type' siempre tenga valor ("mapped" o "general")
  const rawItems = payload.items ?? items
  const sanitizedItems = rawItems.map((item) => ({
    ...item,
    type: item.type ?? (item.seatingUnitId || (item.seatingIds && item.seatingIds.length > 0) ? "mapped" : "general"),
  })) as Parameters<typeof resolveMappedSeatingUnits>[2]

  const resolvedCart = await resolveMappedSeatingUnits(
    db,
    payload.eventId,
    sanitizedItems,
  )
  if (!resolvedCart.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: "out_of_stock" }
  }
  const cartItems = resolvedCart.items
  const seatingItems = cartItems.filter((item) => isMappedCheckoutItem(item))
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  const user = earlyUser

  const checkoutAllowed = await consumeRateLimit({
    bucketKey: `checkout:user:${user.id}`,
    limit: 8,
    windowSeconds: 10 * 60,
    useAdmin: true,
  })
  if (!checkoutAllowed) {
    return {
      success: false,
      error:
        "Has superado el límite de intentos de compra. Por favor, espera unos minutos.",
    }
  }

  const [{ data: eventRow }, { data: eventTiers }] = await Promise.all([
    db
      .from("events")
      .select("date, ends_at, schedule_days, title, max_tickets_per_user")
      .eq("id", payload.eventId)
      .maybeSingle(),
    db
      .from("ticket_tiers")
      .select("capacity, sold, visibility")
      .eq("event_id", payload.eventId),
  ])

  if (
    eventRow &&
    isPastEvent({
      date: eventRow.date,
      endsAt: eventRow.ends_at,
      scheduleDays: eventRow.schedule_days,
    })
  ) {
    return { success: false, error: EVENT_FINISHED_ERROR }
  }

  if (isSoldOut({ tiers: eventTiers })) {
    return { success: false, error: EVENT_SOLD_OUT_ERROR }
  }

  const identityCap = await assertGuestTicketCap({
    eventId: payload.eventId,
    dni: buyer.buyerDni,
    email: buyer.buyerEmail,
    quantity: cartQuantity,
    maxTicketsPerUser: eventRow?.max_tickets_per_user,
  })
  if (!identityCap.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: identityCap.error }
  }

  // Progressive profiling: DNI + teléfono permanentes en el perfil.
  // email no está en column grant → no lo tocamos acá.
  await supabase
    .from("profiles")
    .update({
      full_name: buyer.buyerName,
      dni: buyer.buyerDni,
      phone: buyer.buyerPhone || null,
    })
    .eq("id", user.id)

  // Nunca confiar en promoter_id del cliente: solo resolver ?rrpp= / ?ref= en servidor.
  let promoterId: string | null = null
  const cleanRef = payload.referralCode
  if (cleanRef) {
    const { data: resolved } = await supabase.rpc(
      "resolve_promoter_for_checkout",
      {
        p_referral_code: cleanRef,
        p_event_id: payload.eventId,
      },
    )
    promoterId = resolved ?? null
  }

  const tierIds = [...new Set(cartItems.map((item) => checkoutItemTierId(item)))]
  const { data: tierMeta } = await db
    .from("ticket_tiers")
    .select("id, seating_sector_id, tier_type, category")
    .eq("event_id", payload.eventId)
    .in("id", tierIds)

  const sectorByTier = new Map(
    (tierMeta ?? []).map((row) => [row.id, row.seating_sector_id]),
  )

  const quantityItemsForPhases = cartItems.filter(
    (item) => !isMappedCheckoutItem(item),
  )
  const phasesByTier = await loadCheckoutTierPhases(
    db,
    quantityItemsForPhases.map((item) => checkoutItemTierId(item)),
  )

  const quoted = await quoteCheckoutFromDatabase(
    db,
    payload.eventId,
    cartItems,
    phasesByTier,
  )
  if (!quoted.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: quoted.error }
  }

  const rpcItems = cartItems.map((item) => {
    const tierId = checkoutItemTierId(item)
    const decision = decidePhaseCart(
      phasesByTier.get(tierId) ?? [],
      item.quantity,
    )
    return toReserveRpcItem(item, {
      sectorKey: item.sectorKey ?? sectorByTier.get(tierId) ?? null,
      phaseId: decision.kind === "ok" ? decision.phase.id : null,
    })
  })

  let pendingOrderId: string | null = null

  try {
    const hasSeating = seatingItems.length > 0
    const hasBundle = (tierMeta ?? []).some(
      (row) => row.tier_type === "bundle" || row.category === "bundle",
    )
    const quantityItems = cartItems.filter(
      (item) => !isMappedCheckoutItem(item),
    )
    const canUseAtomic =
      !hasSeating &&
      !hasBundle &&
      quantityItems.length === 1 &&
      cartItems.length === 1

    const phaseGate = await evaluateCartPhaseRollover(
      db,
      payload.eventId,
      cartItems,
    )
    if (phaseGate) return phaseGate

    let reservation: {
      data: ReserveTxRow[] | AtomicReserveRow[] | null
      error: { message: string; code?: string } | null
    }

    const isGaOnly = !hasSeating && !hasBundle

    if (isGaOnly) {
      const claimed = await db.rpc("claim_and_reserve_ga_cart_tx", {
        p_event_id: payload.eventId,
        p_owner_id: user.id,
        p_items: rpcItems,
        p_promoter_id: promoterId,
      })
      const missingClaim = Boolean(
        claimed.error &&
          /could not find|schema cache|does not exist/i.test(
            claimed.error.message,
          ),
      )
      if (!missingClaim) {
        reservation = claimed
      } else if (canUseAtomic) {
        const item = quantityItems[0]
        const decision = decidePhaseCart(
          phasesByTier.get(checkoutItemTierId(item)) ?? [],
          item.quantity,
        )
        const phaseId = decision.kind === "ok" ? decision.phase.id : null
        const atomic = await reserveGeneralAdmissionAtomic(db, {
          eventId: payload.eventId,
          ownerId: user.id,
          tierId: checkoutItemTierId(item),
          quantity: item.quantity,
          phaseId,
          promoterId,
        })
        reservation = atomic.missing
          ? await db.rpc("reserve_tickets_tx", {
              p_event_id: payload.eventId,
              p_owner_id: user.id,
              p_items: rpcItems,
              p_promoter_id: promoterId,
            })
          : (atomic.reservation ?? {
              data: null,
              error: { message: "No se pudo completar la reserva atómica." },
            })
      } else {
        reservation = await db.rpc("reserve_tickets_tx", {
          p_event_id: payload.eventId,
          p_owner_id: user.id,
          p_items: rpcItems,
          p_promoter_id: promoterId,
        })
      }
    } else {
      const hybrid = await db.rpc("reserve_hybrid_cart_tx", {
        p_event_id: payload.eventId,
        p_owner_id: user.id,
        p_items: rpcItems,
        p_promoter_id: promoterId,
      })
      const missingHybrid = Boolean(
        hybrid.error &&
          /could not find|schema cache|does not exist/i.test(
            hybrid.error.message,
          ),
      )
      reservation = missingHybrid
        ? await db.rpc("reserve_unified_cart_tx", {
            p_event_id: payload.eventId,
            p_owner_id: user.id,
            p_items: rpcItems,
            p_promoter_id: promoterId,
          })
        : hybrid
    }
    const { data, error } = reservation

    if (error) {
      if (isPhaseStockError(error.message)) {
        return resolvePhaseRolloverAfterError(
          db,
          payload.eventId,
          cartItems,
        )
      }
      const mapped = mapReserveRpcError(reserveRpcErrorText(error))
      if (mapped) return mapped

      logger.error({
        context: "checkout/reservation",
        message: "reservation_rpc_failed",
        eventId: payload.eventId,
        userId: user.id,
        error: error.message,
      })
      return {
        success: false,
        error: "No se pudo completar la reserva. Intentá nuevamente.",
      }
    }

    const rows = (data ?? []) as ReserveTxRow[]
    if (rows.length === 0) {
      return { success: false, error: "out_of_stock" }
    }

    const orderId = rows[0].order_id
    pendingOrderId = orderId
    const reservedRow = rows[0] as ReserveTxRow & Partial<AtomicReserveRow>
    const reservedMerchandise = Number(
      reservedRow.total_amount ??
        (reservedRow.unit_price ?? 0) * (reservedRow.quantity ?? 0),
    )
    if (
      !Number.isFinite(reservedMerchandise) ||
      !amountsMatch(reservedMerchandise, quoted.total)
    ) {
      await cleanupPendingOrder(orderId)
      logger.error({
        context: "checkout/reservation",
        message: "server_price_mismatch",
        eventId: payload.eventId,
        quoted: quoted.total,
        reserved: reservedMerchandise,
      })
      return {
        success: false,
        error: "El total de la orden no coincide con el precio vigente.",
      }
    }
    const reservedTickets: ReservedTicket[] = rows.map((row) => ({
      ticket_id: row.ticket_id,
    }))

    const holderApplied = await applyHolderIdentityToOrder({
      orderId,
      buyer,
    })
    if (!holderApplied.ok) {
      await cleanupPendingOrder(orderId)
      await recordCheckoutFailure(ctx)
      return { success: false, error: holderApplied.error }
    }

    await persistOrderCustomerPhone({
      orderId,
      phone: buyer.buyerPhone,
    })
    await persistOrderGuestToken(orderId)
    await issueCheckoutFulfillmentCookie(orderId)
    await persistCheckoutSecurityEvent({
      orderId,
      eventId: payload.eventId,
      buyerId: user.id,
      ctx,
      deviceHash: options?.deviceHash,
      dwellMs: options?.dwellMs,
    })

    if (payload.addons.length > 0) {
      const { error: addonsError } = await db.rpc(
        "attach_event_items_to_order",
        {
          p_order_id: orderId,
          p_owner_id: user.id,
          p_items: payload.addons.map((addon) => ({
            item_id: addon.itemId,
            quantity: addon.quantity,
          })),
        },
      )

      if (addonsError) {
        await cleanupPendingOrder(orderId)

        const mappedAddons = mapReserveRpcError(
          reserveRpcErrorText(addonsError),
        )
        if (mappedAddons) return mappedAddons

        return {
          success: false,
          error: "No se pudieron reservar las consumiciones.",
        }
      }
    }

    const cleanPromoId = payload.promoCodeId
    if (cleanPromoId) {
      const { data: promoRows, error: promoError } = await db.rpc(
        "apply_promo_code_to_order",
        {
          p_order_id: orderId,
          p_owner_id: user.id,
          p_promo_code_id: cleanPromoId,
        },
      )

      const promoResult = Array.isArray(promoRows) ? promoRows[0] : promoRows
      if (promoError || !promoResult?.ok) {
        await cleanupPendingOrder(orderId)
        logger.error({
          context: "checkout/promo",
          message: "promo_apply_failed",
          orderId,
          error: promoError?.message ?? promoResult?.message,
        })
        return {
          success: false,
          error: "No se pudo aplicar el cupón.",
        }
      }
    }

    const { data: pricedOrder, error: pricedOrderError } = await db
      .from("orders")
      .select("total_amount")
      .eq("id", orderId)
      .eq("buyer_id", user.id)
      .maybeSingle()

    if (pricedOrderError || !pricedOrder) {
      await cleanupPendingOrder(orderId)
      return {
        success: false,
        error: "No se pudo validar el total final de la orden.",
      }
    }

    const finalTotal = Number(pricedOrder.total_amount)
    if (!Number.isFinite(finalTotal) || finalTotal < 0) {
      await cleanupPendingOrder(orderId)
      return { success: false, error: "El total de la orden es inválido." }
    }

    let initPoint: string
    const useSandbox = access.useSandbox
    const reservedUntil = rows[0]?.reserved_until
    const checkoutExpiresAt = resolveCheckoutExpiresAt(reservedUntil).toISOString()

    const legalGate = await persistOrderLegalGate({
      orderId,
      eventId: payload.eventId,
      buyerId: user.id,
      sandbox: useSandbox,
      termsAccepted: payload.termsAccepted !== false,
    })
    if (!legalGate.ok) {
      await cleanupPendingOrder(orderId)
      return { success: false, error: legalGate.error }
    }

    if (useSandbox) {
      const admin = createAdminClient()
      const { data: finalized, error: finalizeError } = await admin.rpc(
        "finalize_paid_order",
        {
          p_order_id: orderId,
          p_mp_payment_id: `sandbox:${orderId}`,
        },
      )
      const result = (finalized ?? {}) as { ok?: boolean; code?: string }

      if (finalizeError || !result.ok) {
        await cleanupPendingOrder(orderId)
        const finalizeMessage =
          finalizeError?.message ?? result.code ?? "unknown"
        logger.error({
          context: "checkout/sandbox",
          message: "sandbox_finalize_failed",
          orderId,
          userId: user.id,
          error: finalizeMessage,
        })
        const mapped = mapReserveRpcError(finalizeMessage)
        return {
          success: false,
          error: mapped?.error ?? "No se pudo completar la compra de prueba.",
        }
      }

      const { error: markError } = await admin.rpc("mark_order_test_sandbox", {
        p_order_id: orderId,
      })
      if (markError) {
        logger.error({
          context: "checkout/sandbox",
          message: "sandbox_mark_failed",
          orderId,
          error: markError.message,
        })
      }

      initPoint = `/checkout/success?order_id=${orderId}&sandbox=1`
    } else if (finalTotal === 0) {
      const admin = createAdminClient()
      const { data: finalized, error: finalizeError } = await admin.rpc(
        "finalize_paid_order",
        {
          p_order_id: orderId,
          p_mp_payment_id: `free:${orderId}`,
        },
      )
      const result = (finalized ?? {}) as { ok?: boolean; code?: string }

      if (finalizeError || !result.ok) {
        await cleanupPendingOrder(orderId)
        logger.error({
          context: "checkout/free",
          message: "free_order_finalize_failed",
          orderId,
          userId: user.id,
          error: finalizeError?.message ?? result.code ?? "unknown",
        })
        return {
          success: false,
          error: "No se pudo emitir la entrada gratuita.",
        }
      }

      initPoint = `/checkout/success?order_id=${orderId}&free=1`
    } else {
      const provider = payload.paymentProvider
      let adapter
      try {
        adapter = PaymentGatewayFactory.getAdapter(provider)
      } catch (error) {
        await cleanupPendingOrder(orderId)
        captureCriticalException(error, "checkout/payment", {
          orderId,
          provider,
        })
        const message =
          error instanceof PaymentProviderNotSupportedError
            ? error.message
            : GENERIC_CHECKOUT_ERROR
        logger.error({
          context: "checkout/payment",
          message: "adapter_unavailable",
          orderId,
          provider,
          error,
        })
        return { success: false, error: message }
      }

      const siteUrl = getSiteUrl()
      const urls = buildCheckoutBackUrls(siteUrl, orderId)
      const webhookUrl =
        provider === "mercadopago"
          ? urls.notificationUrl
          : `${siteUrl.replace(/\/$/, "")}/api/webhooks/${provider}`

      try {
        await expireCheckoutPreferenceOnOrder(orderId)
        await invalidateStaleCheckoutPreferences({
          buyerId: user.id,
          eventId: payload.eventId,
          exceptOrderId: orderId,
        })
      } catch (error) {
        logger.error({
          context: "checkout/payment",
          message: "stale_preference_invalidate_failed",
          orderId,
          eventId: payload.eventId,
          error,
        })
      }

      try {
        const session = await adapter.createCheckoutSession({
          orderId,
          amount: finalTotal,
          currency: "ARS",
          description: `${eventRow?.title ?? "Tokepass"} — entradas`.slice(
            0,
            256,
          ),
          buyer: {
            name: buyer.buyerName,
            email: buyer.buyerEmail,
            dni: buyer.buyerDni,
          },
          items: [
            {
              title: `${eventRow?.title ?? "Tokepass"} — entradas`,
              quantity: 1,
              unitPrice: finalTotal,
            },
          ],
          redirectUrls: {
            success: urls.success,
            failure: urls.failure,
            pending: urls.pending,
          },
          webhookUrl,
          expiresAt: checkoutExpiresAt,
        })

        const admin = createAdminClient()
        const providerRow: PaymentProvider = session.provider
        const { data: updatedOrder, error: persistError } = await admin
          .from("orders")
          .update({
            payment_provider: providerRow,
            provider_preference_id: session.preferenceId,
            ...(session.provider === "mercadopago"
              ? { mp_preference_id: session.preferenceId }
              : {}),
          })
          .eq("id", orderId)
          .eq("status", "pending")
          .select("id")
          .maybeSingle()

        if (persistError || !updatedOrder) {
          await cleanupPendingOrder(orderId)
          logger.error({
            context: "checkout/payment",
            message: "provider_preference_persist_failed",
            orderId,
            provider: session.provider,
            error: persistError?.message ?? "order_not_pending",
          })
          return {
            success: false,
            error: GENERIC_CHECKOUT_ERROR,
          }
        }

        initPoint = session.checkoutUrl
      } catch (error) {
        await cleanupPendingOrder(orderId)
        captureCriticalException(error, "checkout/payment", {
          orderId,
          provider,
        })
        logger.error({
          context: "checkout/payment",
          message: "checkout_session_failed",
          orderId,
          provider,
          error,
        })
        return {
          success: false,
          error:
            error instanceof PaymentProviderUnavailableError
              ? error.message
              : GENERIC_CHECKOUT_ERROR,
        }
      }
    }

    pendingOrderId = null
    try {
      await releaseWaitingRoomPassFromCookies()
    } catch {
      // Slot GC must not block a successful payment redirect.
    }
    revalidatePath(`/events/${payload.eventId}`)
    revalidatePath("/events")
    revalidatePath("/cuenta/entradas")
    revalidatePath("/admin")
    revalidatePath("/admin/promoters")
    revalidatePath("/promoter/dashboard")
    revalidatePath("/superadmin")
    revalidatePath("/super-admin")

    return {
      success: true,
      tickets: reservedTickets,
      orderId,
      initPoint,
      paymentUrl: initPoint,
      expiresAt: checkoutExpiresAt,
      ...(reservedUntil ? { reservedUntil } : {}),
    }
  } catch (error) {
    if (pendingOrderId) {
      await cleanupPendingOrder(pendingOrderId)
    }

    const message = error instanceof Error ? error.message : String(error ?? "")
    if (isPhaseStockError(message)) {
      return resolvePhaseRolloverAfterError(supabase, payload.eventId, cartItems)
    }
    const mappedUnexpected = mapReserveRpcError(message)
    if (mappedUnexpected) return mappedUnexpected

    captureCriticalException(error, "checkout/start", {
      eventId: payload.eventId,
      userId: user.id,
      orderId: pendingOrderId ?? undefined,
    })
    logger.error({
      context: "checkout/start",
      message: "unexpected_checkout_error",
      eventId: payload.eventId,
      userId: user.id,
      orderId: pendingOrderId,
      error,
    })
    return {
      success: false,
      error: GENERIC_CHECKOUT_ERROR,
    }
  }
}

async function assertSandboxCheckoutAllowed(
  eventId: string,
  userId: string,
  previewKey?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await resolveCheckoutEventAccess({
    eventId,
    userId,
    previewKey,
  })
  if (!access.ok) return access
  if (!access.useSandbox) {
    return {
      ok: false,
      error:
        "Las compras de prueba solo están disponibles en eventos en borrador.",
    }
  }
  return { ok: true }
}

/** ¿El usuario autenticado puede simular el pago de este borrador? */
export async function canUserSandboxCheckout(
  eventId: string,
  previewKey?: string | null,
): Promise<boolean> {
  if (!eventId) return false
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const allowed = await assertSandboxCheckoutAllowed(
    eventId,
    user.id,
    previewKey,
  )
  return allowed.ok
}

/**
 * Compra de prueba (Modo Sandbox): misma reserva atómica, sin Mercado Pago.
 */
export async function startSandboxCheckout(
  eventId: string,
  items: CheckoutCartItemInput[],
  referralCode?: string | null,
  addons: CheckoutAddonItem[] = [],
  buyerInfo?: CheckoutBuyerInfo | null,
  promoCodeId?: string | null,
  previewKey?: string | null,
  termsAccepted = true,
): Promise<CheckoutResult> {
  const parsed = CheckoutPayloadSchema.safeParse({
    eventId,
    items,
    addons,
    buyer: buyerInfo,
    referralCode,
    promoCodeId,
    sandbox: true,
    termsAccepted,
    previewKey: normalizePreviewKey(previewKey),
  })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }

  return startCheckoutWithPayment(
    parsed.data.eventId,
    parsed.data.items ?? items,
    parsed.data.referralCode,
    parsed.data.addons,
    buyerToHolderFields(parsed.data.buyer),
    parsed.data.promoCodeId,
    {
      sandbox: true,
      previewKey: parsed.data.previewKey,
      termsAccepted: parsed.data.termsAccepted !== false,
    },
  )
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

/**
 * Facade pedida por Checkout Preference API.
 * Internamente: reserva atómica → PaymentGatewayFactory → checkoutUrl.
 * El cliente debe hacer `window.location.assign(paymentUrl)` de inmediato.
 * No confía en `unitPrice` del cliente.
 */
export async function createCheckoutPreference(
  input: CreateCheckoutPreferenceInput,
): Promise<CheckoutResult> {
  const parsed = CheckoutPayloadSchema.safeParse({
    eventId: input.eventId,
    items: [{ tierId: input.ticketTypeId, quantity: input.quantity }],
    buyer: {
      buyerName: input.buyerName ?? "",
      buyerDni: input.buyerDni ?? "",
      buyerEmail: input.buyerEmail ?? "",
      buyerPhone: "",
    },
    referralCode: input.referralCode,
  })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }

  return startCheckoutWithPayment(
    parsed.data.eventId,
    parsed.data.items ?? [],
    parsed.data.referralCode,
    parsed.data.addons,
    buyerToHolderFields(parsed.data.buyer),
    parsed.data.promoCodeId,
  )
}
