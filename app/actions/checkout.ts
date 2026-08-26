"use server"

import { revalidatePath } from "next/cache"

import { resolveCheckoutExpiresAt } from "@/lib/checkout-hold"
import { assertPendingOrderStillReservable } from "@/lib/checkout/assert-order-stock"
import { releaseWaitingRoomPassFromCookies } from "@/lib/waiting-room/release"
import {
  type CheckoutBuyerInfo,
  type NormalizedCheckoutBuyer,
} from "@/lib/checkout-buyer"
import { PHONE_ERROR } from "@/lib/checkout/guest-input"
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
import {
  isMissingSaleWindowSchema,
  resolveTicketSaleState,
  ticketSaleWindowError,
} from "@/lib/inventory/ticket-sale-window"
import { isPastEvent, isSoldOut } from "@/lib/event-status"
import { eventAcceptsMercadoPago } from "@/lib/events/checkout-policy"
import { isSandboxEventStatus } from "@/lib/events/review-status"
import { orderTestFlags } from "@/lib/finance/order-test-flags"
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
  CHECKOUT_FEEDBACK_CODE,
  checkoutActionFailure,
} from "@/lib/checkout/checkout-feedback"
import {
  CHECKOUT_IDEMPOTENCY_CART_MISMATCH_ERROR,
  CHECKOUT_IDEMPOTENCY_WINDOW_MS,
  CHECKOUT_IN_PROGRESS_ERROR,
  checkoutCartFingerprint,
  checkoutTicketRowsFingerprint,
  isReusableCheckoutOrderStatus,
} from "@/lib/checkout/idempotency"
import {
  CHECKOUT_PRICES_CHANGED_ERROR,
  displayedTotalMatchesServer,
} from "@/lib/checkout/price-guard"
import {
  ERR_NO_STOCK,
  ERR_SEAT_TAKEN,
  GENERAL_STOCK_UNAVAILABLE,
  SEAT_SELECTION_REQUIRED,
  SEAT_UNAVAILABLE,
  SECTOR_NOT_CONFIGURED,
  encodeGeneralStockUnavailable,
  layoutRequiresSeatSelection,
} from "@/lib/checkout/revalidate-seat-holds"
import {
  layoutHoldSectorCandidates,
  pickSeatingUnitForLayoutHold,
} from "@/lib/checkout/layout-hold-unit"
import {
  MISSING_EVENT_DATE_ID,
  asHoldEventDateId,
  requireHoldEventDateId,
  seatingUnitMatchesEventDate,
} from "@/lib/checkout/seat-hold-day"
import {
  generalTierRemaining,
  partitionMixedCartItems,
  tierIsNumbered,
} from "@/lib/checkout/mixed-cart"
import {
  HIGH_DEMAND_LOCK_TIMEOUT,
  isHighDemandLockError,
  reserveRpcErrorText,
} from "@/lib/checkout/lock-timeout"
import {
  CHECKOUT_VERIFY_ERROR,
  verifyCheckoutCaptcha,
} from "@/lib/checkout/bot-guard"
import { getCheckoutRequestContext } from "@/lib/checkout/request-context"
import { consumeNamedRateLimit } from "@/lib/security/distributed-rate-limit"
import { assertWaitingRoomCheckoutPass } from "@/lib/waiting-room/assert-checkout-pass"
import {
  CHECKOUT_BUSY_ERROR,
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
import { createAdminClient, tryCreateAdminClient } from "@/lib/supabase/admin"
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
  assertCartRemainingStock,
  assertCartTierPurchaseLimits,
} from "@/lib/checkout-limits"
import {
  CheckoutEventIdSchema,
  CheckoutLayoutHoldSchema,
  CheckoutLockTicketsSchema,
  CheckoutPayloadSchema,
  CheckoutSeatHoldSchema,
  buyerToHolderFields,
  checkoutTermsAreAccepted,
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

type ReserveTxRow = {
  order_id: string
  ticket_id: string
  subtotal: number
  service_charge: number
  total_amount: number
  reserved_until?: string
}

function mapReserveRpcError(
  message: string,
): Extract<CheckoutResult, { success: false }> | null {
  if (/missing_event_date_id/i.test(message)) {
    return { success: false, error: MISSING_EVENT_DATE_ID }
  }

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

  if (
    normalized.includes("tier_purchase_max_exceeded") ||
    normalized.includes("tier_purchase_min_exceeded")
  ) {
    return {
      success: false,
      error: message.replace(/^TIER_PURCHASE_(MAX|MIN)_EXCEEDED:\s*/i, ""),
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
    /could not find the function|function .+ does not exist|pgrst202|schema cache/i.test(
      normalized,
    )
  ) {
    return null
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
    return { success: false, error: "out_of_stock", code: ERR_NO_STOCK }
  }

  return null
}

type CheckoutSupabase = Awaited<ReturnType<typeof createClient>>

/** Cookie / ?rrpp= primero; si el cupón tiene RRPP, el cupón manda. */
async function resolveCheckoutPromoterId(input: {
  supabase: CheckoutSupabase
  eventId: string
  referralCode?: string | null
  promoCodeId?: string | null
}): Promise<string | null> {
  let promoterId: string | null = null
  const cleanRef = input.referralCode?.trim()
  if (cleanRef) {
    const { data: resolved } = await input.supabase.rpc(
      "resolve_promoter_for_checkout",
      {
        p_referral_code: cleanRef,
        p_event_id: input.eventId,
      },
    )
    promoterId = resolved ?? null
  }

  const promoCodeId = input.promoCodeId?.trim()
  if (!promoCodeId) return promoterId

  try {
    const admin = createAdminClient()
    const { data: promo, error } = await admin
      .from("promo_codes")
      .select("promoter_id, event_id")
      .eq("id", promoCodeId)
      .eq("event_id", input.eventId)
      .maybeSingle()

    if (error || !promo?.promoter_id) return promoterId

    const [{ data: promoter }, { data: event }] = await Promise.all([
      admin
        .from("promoters")
        .select("id, organizer_id")
        .eq("id", promo.promoter_id)
        .maybeSingle(),
      admin
        .from("events")
        .select("organizer_id")
        .eq("id", input.eventId)
        .maybeSingle(),
    ])

    if (promoter && event && promoter.organizer_id === event.organizer_id) {
      return promoter.id
    }
  } catch {
    return promoterId
  }

  return promoterId
}

async function attachPromoterToPendingOrder(input: {
  orderId: string
  buyerId: string
  promoterId: string
}) {
  const admin = createAdminClient()
  const { error } = await admin
    .from("orders")
    .update({ promoter_id: input.promoterId })
    .eq("id", input.orderId)
    .eq("buyer_id", input.buyerId)
    .eq("status", "pending")
  if (error) {
    logger.error({
      context: "checkout/reservation",
      message: "promoter_attach_failed",
      orderId: input.orderId,
      error: error.message,
    })
  }
}

type CheckoutEventAccess =
  | {
      ok: true
      useSandbox: boolean
      db: CheckoutSupabase
      eventId: string
      eventSlug: string | null
    }
  | { ok: false; error: string }

async function assertCheckoutWaitingRoom(input: {
  eventId: string
  eventSlug?: string | null
  bypass?: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.bypass) return { ok: true }
  return assertWaitingRoomCheckoutPass([input.eventId, input.eventSlug])
}

async function resolveCheckoutEventAccess(input: {
  eventId: string
  userId: string
  previewKey?: string | null
}): Promise<CheckoutEventAccess> {
  const userClient = await createClient()
  const admin = tryCreateAdminClient() as CheckoutSupabase | null
  const { data: event } = await (admin ?? userClient)
    .from("events")
    .select("id, slug, organizer_id, status")
    .eq("id", input.eventId)
    .maybeSingle()

  if (!event) {
    return { ok: false, error: "Evento no encontrado." }
  }

  if (event.status === "published") {
    return {
      ok: true,
      useSandbox: false,
      db: userClient,
      eventId: event.id,
      eventSlug: event.slug ?? null,
    }
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
    return {
      ok: true,
      useSandbox: false,
      db: userClient,
      eventId: event.id,
      eventSlug: event.slug ?? null,
    }
  }

  if (!isSandboxEventStatus(event.status)) {
    return {
      ok: false,
      error: "Este evento no admite compras de prueba en su estado actual.",
    }
  }

  if (!admin) {
    return { ok: false, error: "No se pudo verificar el evento." }
  }

  const key = normalizePreviewKey(input.previewKey)
  if (key) {
    const { data: matches } = await admin.rpc("event_preview_key_matches", {
      p_event_id: input.eventId,
      p_key: key,
    })
    if (matches) {
      return {
        ok: true,
        useSandbox: true,
        db: admin,
        eventId: event.id,
        eventSlug: event.slug ?? null,
      }
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

  return {
    ok: true,
    useSandbox: true,
    db: admin,
    eventId: event.id,
    eventSlug: event.slug ?? null,
  }
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

async function evaluateCartSaleWindows(
  supabase: CheckoutSupabase,
  eventId: string,
  items: CheckoutCartItem[],
): Promise<CheckoutResult | null> {
  const tierIds = [
    ...new Set(
      items
        .map((item) => checkoutItemTierId(item))
        .filter((id) => id.length > 0),
    ),
  ]
  if (tierIds.length === 0) return null

  const { data, error } = await supabase
    .from("ticket_tiers")
    .select("id, capacity, sold, sale_starts_at, sale_ends_at")
    .eq("event_id", eventId)
    .in("id", tierIds)

  if (error) {
    if (isMissingSaleWindowSchema(error.message)) return null
    logger.error({
      context: "checkout/sale-window",
      message: "ticket_sale_window_load_failed",
      error: error.message,
    })
    return {
      success: false,
      error: "No se pudo validar la ventana de venta.",
    }
  }

  const now = Date.now()
  for (const item of items) {
    const tierId = checkoutItemTierId(item)
    const row = (data ?? []).find((tier) => tier.id === tierId)
    if (!row) continue
    const state = resolveTicketSaleState({
      capacity: row.capacity,
      sold: row.sold,
      saleStartsAt: (row as { sale_starts_at?: string | null }).sale_starts_at,
      saleEndsAt: (row as { sale_ends_at?: string | null }).sale_ends_at,
      now,
    })
    const message = ticketSaleWindowError(state)
    if (message) {
      return { success: false, error: message }
    }
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
  | { ok: false; error: typeof SEAT_UNAVAILABLE | typeof SEAT_SELECTION_REQUIRED }
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
    if (!elementId) return { ok: false, error: SEAT_SELECTION_REQUIRED }
    const { data } = await supabase
      .from("event_seating_units")
      .select("id")
      .eq("event_id", eventId)
      .eq("layout_item_id", elementId)
      .maybeSingle()
    if (!data?.id) return { ok: false, error: SEAT_UNAVAILABLE }
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
  const { data: tierRows } = await supabase
    .from("ticket_tiers")
    .select("id, price")
    .eq("event_id", eventId)
    .in("id", tierIds)

  const unitPriceByTier = new Map<string, number>()
  for (const row of tierRows ?? []) {
    const price = Number(row.price)
    if (Number.isFinite(price) && price >= 0) {
      unitPriceByTier.set(row.id, price)
    }
  }

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

function isMissingIdempotencySchema(
  error: { message?: string | null } | null | undefined,
): boolean {
  return Boolean(
    error?.message &&
      /could not find|schema cache|does not exist/i.test(error.message),
  )
}

async function claimCheckoutIdempotencyKey(
  db: CheckoutSupabase,
  input: {
    buyerId: string
    eventId: string
    key: string
    fingerprint: string
  },
): Promise<
  | { kind: "new" }
  | { kind: "in_progress" }
  | { kind: "mismatch" }
  | { kind: "reused"; orderId: string; status: string }
  | { kind: "unavailable" }
> {
  const claimed = await db.rpc("claim_checkout_idempotency_key", {
    p_buyer_id: input.buyerId,
    p_event_id: input.eventId,
    p_idempotency_key: input.key,
    p_cart_fingerprint: input.fingerprint,
  })
  if (claimed.error) {
    if (!isMissingIdempotencySchema(claimed.error)) {
      logger.error({
        context: "checkout/idempotency",
        message: "claim_failed",
        eventId: input.eventId,
        error: claimed.error.message,
      })
    }
    return { kind: "unavailable" }
  }
  const row = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data
  if (!row) return { kind: "new" }
  if (row.fingerprint_mismatch) return { kind: "mismatch" }
  if (row.in_progress) return { kind: "in_progress" }
  if (
    row.reused &&
    row.order_id &&
    isReusableCheckoutOrderStatus(row.order_status)
  ) {
    return {
      kind: "reused",
      orderId: row.order_id,
      status: row.order_status ?? "pending",
    }
  }
  return { kind: "new" }
}

async function attachCheckoutIdempotencyOrder(
  db: CheckoutSupabase,
  input: { buyerId: string; key: string | null | undefined; orderId: string },
): Promise<void> {
  const key = input.key?.trim()
  if (!key) return
  const attached = await db.rpc("attach_checkout_idempotency_order", {
    p_buyer_id: input.buyerId,
    p_idempotency_key: key,
    p_order_id: input.orderId,
  })
  if (attached.error && !isMissingIdempotencySchema(attached.error)) {
    logger.error({
      context: "checkout/idempotency",
      message: "attach_failed",
      orderId: input.orderId,
      error: attached.error.message,
    })
  }
}

async function loadReusableCheckoutOrder(
  db: CheckoutSupabase,
  input: {
    orderId: string
    buyerId: string
    fingerprint: string
  },
): Promise<{
  orderId: string
  promoCodeId: string | null
  rows: ReserveTxRow[]
} | null> {
  const { data: order } = await db
    .from("orders")
    .select("id, status, total_amount, promo_code_id")
    .eq("id", input.orderId)
    .eq("buyer_id", input.buyerId)
    .eq("status", "pending")
    .maybeSingle()
  if (!order) return null

  const { data: tickets } = await db
    .from("tickets")
    .select("id, tier_id, seating_unit_id")
    .eq("order_id", order.id)
    .eq("owner_id", input.buyerId)
  if (!tickets?.length) return null
  if (checkoutTicketRowsFingerprint(tickets) !== input.fingerprint) return null

  const totalAmount = Number(order.total_amount)
  return {
    orderId: order.id,
    promoCodeId: order.promo_code_id,
    rows: tickets.map((ticket) => ({
      order_id: order.id,
      ticket_id: ticket.id,
      subtotal: 0,
      service_charge: 0,
      total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
    })),
  }
}

async function findReusablePendingCheckoutOrder(
  db: CheckoutSupabase,
  input: {
    userId: string
    eventId: string
    fingerprint: string
  },
): Promise<{
  orderId: string
  promoCodeId: string | null
  rows: ReserveTxRow[]
} | null> {
  const since = new Date(Date.now() - CHECKOUT_IDEMPOTENCY_WINDOW_MS).toISOString()
  const { data: tickets } = await db
    .from("tickets")
    .select("id, order_id, tier_id, seating_unit_id")
    .eq("event_id", input.eventId)
    .eq("owner_id", input.userId)
    .eq("status", "pending_payment")
  if (!tickets?.length) return null

  const byOrder = new Map<string, typeof tickets>()
  for (const row of tickets) {
    const orderId = row.order_id?.trim()
    if (!orderId) continue
    const list = byOrder.get(orderId) ?? []
    list.push(row)
    byOrder.set(orderId, list)
  }
  const orderIds = [...byOrder.keys()]
  if (orderIds.length === 0) return null

  const { data: orders } = await db
    .from("orders")
    .select("id, status, total_amount, promo_code_id, created_at")
    .in("id", orderIds)
    .eq("buyer_id", input.userId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })

  for (const order of orders ?? []) {
    const rows = byOrder.get(order.id) ?? []
    if (checkoutTicketRowsFingerprint(rows) !== input.fingerprint) continue
    const totalAmount = Number(order.total_amount)
    return {
      orderId: order.id,
      promoCodeId: order.promo_code_id,
      rows: rows.map((ticket) => ({
        order_id: order.id,
        ticket_id: ticket.id,
        subtotal: 0,
        service_charge: 0,
        total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
      })),
    }
  }
  return null
}

async function cleanupPendingOrder(orderId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const released = await admin.rpc("release_checkout_idempotency_order", {
      p_order_id: orderId,
    })
    if (released.error && !isMissingIdempotencySchema(released.error)) {
      logger.error({
        context: "checkout/cleanup",
        message: "idempotency_release_failed",
        orderId,
        error: released.error.message,
      })
    }
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

  const room = await assertCheckoutWaitingRoom({
    eventId: access.eventId,
    eventSlug: access.eventSlug,
    bypass: access.useSandbox || Boolean(previewKey),
  })
  if (!room.ok) {
    return { success: false, error: room.error }
  }

  const allowed = await consumeNamedRateLimit("cartHoldUser", user.id)
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
      return { success: false, error: mapped.error }
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

async function loadEventSeatingSectorIds(
  db: CheckoutSupabase,
  eventId: string,
  eventDateId: string | null = null,
): Promise<string[]> {
  const { data, error } = await db
    .from("ticket_tiers")
    .select("seating_sector_id, day_id")
    .eq("event_id", eventId)
  if (error) {
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_layout_tier_sectors_failed",
      eventId,
      error: error.message,
    })
    return []
  }
  const seen = new Set<string>()
  const next: string[] = []
  for (const row of data ?? []) {
    const dayId = asHoldEventDateId(
      (row as { day_id?: string | null }).day_id,
    )
    if (eventDateId && dayId && dayId !== eventDateId) continue
    const id = (
      row as { seating_sector_id?: string | null }
    ).seating_sector_id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  return next
}

async function loadEventScheduleDayIds(
  db: CheckoutSupabase,
  eventId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("event_schedules")
    .select("id")
    .eq("event_id", eventId)
  if (error) {
    if (/event_schedules|schema cache|PGRST205|42P01/i.test(error.message)) {
      return []
    }
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_schedule_days_failed",
      eventId,
      error: error.message,
    })
    return []
  }
  return (data ?? [])
    .map((row) => asHoldEventDateId(row.id))
    .filter((id): id is string => Boolean(id))
}

type LayoutHoldDbRow = {
  id: string
  status: string
  sector_id: string
  event_date_id?: string | null
  ticket_tiers?:
    | { day_id?: string | null }
    | Array<{ day_id?: string | null }>
    | null
}

function layoutHoldRowsFromDb(rows: LayoutHoldDbRow[]) {
  return rows.map((row) => {
    const tier = Array.isArray(row.ticket_tiers)
      ? row.ticket_tiers[0]
      : row.ticket_tiers
    return {
      id: row.id,
      status: row.status,
      sector_id: row.sector_id,
      event_date_id: row.event_date_id ?? null,
      day_id: tier?.day_id ?? null,
    }
  })
}

async function loadLayoutHoldUnits(
  db: CheckoutSupabase,
  input: { eventId: string; layoutItemId: string; eventDateId?: string | null },
) {
  const eventDateId = asHoldEventDateId(input.eventDateId)
  let withDay = db
    .from("event_seating_units")
    .select("id, status, sector_id, event_date_id, ticket_tiers(day_id)")
    .eq("event_id", input.eventId)
    .eq("layout_item_id", input.layoutItemId)
  if (eventDateId) {
    withDay = withDay.or(
      `event_date_id.eq.${eventDateId},event_date_id.is.null`,
    )
  }
  withDay = withDay.limit(24)
  const withDayResult = await withDay
  if (!withDayResult.error) {
    return layoutHoldRowsFromDb((withDayResult.data ?? []) as LayoutHoldDbRow[])
  }
  if (
    !/event_date_id|ticket_tiers|schema cache|PGRST204|42703/i.test(
      withDayResult.error.message,
    )
  ) {
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_layout_unit_lookup_failed",
      eventId: input.eventId,
      layoutItemId: input.layoutItemId,
      eventDateId,
      error: withDayResult.error.message,
    })
    return []
  }
  const fallback = await db
    .from("event_seating_units")
    .select("id, status, sector_id")
    .eq("event_id", input.eventId)
    .eq("layout_item_id", input.layoutItemId)
    .limit(24)
  if (fallback.error) {
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_layout_unit_lookup_failed",
      eventId: input.eventId,
      layoutItemId: input.layoutItemId,
      error: fallback.error.message,
    })
    return []
  }
  return layoutHoldRowsFromDb((fallback.data ?? []) as LayoutHoldDbRow[])
}

export async function holdSeatingUnitForCartByLayoutItem(
  eventId: string,
  sectorId: string,
  layoutItemId: string,
  previewKey?: string | null,
  eventDateId?: string | null,
): Promise<CartSeatingHoldResult & { seatingUnitId?: string }> {
  const parsed = CheckoutLayoutHoldSchema.safeParse({
    eventId,
    sectorId,
    layoutItemId,
    eventDateId,
    dateId: eventDateId,
  })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId
  sectorId = parsed.data.sectorId
  layoutItemId = parsed.data.layoutItemId
  eventDateId =
    asHoldEventDateId(parsed.data.eventDateId) ??
    asHoldEventDateId(parsed.data.dateId)

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
  const scheduleDayIds = await loadEventScheduleDayIds(db, eventId)
  const dayGate = requireHoldEventDateId({
    eventDateId,
    scheduleDayIds,
  })
  if (!dayGate.ok) {
    logger.error({
      context: "checkout/cart-hold",
      message: MISSING_EVENT_DATE_ID,
      eventId,
      sectorId,
      layoutItemId,
    })
    return { success: false, error: MISSING_EVENT_DATE_ID }
  }
  eventDateId = dayGate.eventDateId
  logger.info({
    context: "checkout/cart-hold",
    message: `Intentando reservar: eventId=${eventId}, layoutItemId=${layoutItemId}, sectorId=${sectorId}, eventDateId=${eventDateId ?? ""}`,
    event_id: eventId,
    layoutItemId,
    sectorId,
    eventDateId,
  })

  const room = await assertCheckoutWaitingRoom({
    eventId: access.eventId,
    eventSlug: access.eventSlug,
    bypass: access.useSandbox || Boolean(previewKey),
  })
  if (!room.ok) {
    return { success: false, error: room.error }
  }

  const allowed = await consumeNamedRateLimit("cartHoldUser", user.id)
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Esperá un momento y volvé a elegir.",
    }
  }

  const unitRows = await loadLayoutHoldUnits(db, {
    eventId,
    layoutItemId,
    eventDateId,
  })
  const matchedUnit = pickSeatingUnitForLayoutHold(
    unitRows,
    sectorId,
    eventDateId,
  )
  if (
    eventDateId &&
    unitRows.length > 0 &&
    !unitRows.some((row) => seatingUnitMatchesEventDate(row, eventDateId))
  ) {
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_layout_unit_wrong_day",
      eventId,
      sectorId,
      layoutItemId,
      eventDateId,
    })
    return { success: false, error: "not_materialized" }
  }
  if (
    matchedUnit &&
    matchedUnit.status !== "available" &&
    matchedUnit.status !== "reserved"
  ) {
    return { success: false, error: "out_of_stock" }
  }

  if (matchedUnit) {
    const { data, error } = await db.rpc("hold_seating_unit_for_cart", {
      p_event_id: eventId,
      p_owner_id: user.id,
      p_seating_unit_id: matchedUnit.id,
    })
    if (error) {
      const mapped = mapReserveRpcError(reserveRpcErrorText(error))
      if (mapped) {
        return { success: false, error: mapped.error }
      }
      logger.error({
        context: "checkout/cart-hold",
        message: "hold_seating_unit_for_cart_failed",
        eventId,
        seatingUnitId: matchedUnit.id,
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
    return {
      success: true,
      reservedUntil,
      seatingUnitId: matchedUnit.id,
    }
  }

  const tierSectorIds = await loadEventSeatingSectorIds(
    db,
    eventId,
    eventDateId,
  )
  let lastError: string | null = null
  for (const candidate of layoutHoldSectorCandidates(
    sectorId,
    layoutItemId,
    tierSectorIds,
  )) {
    const rpcArgs = {
      p_event_id: eventId,
      p_owner_id: user.id,
      p_sector_id: candidate,
      p_layout_item_id: layoutItemId,
      ...(eventDateId ? { p_event_date_id: eventDateId } : {}),
    }
    const { data, error } = await db.rpc(
      "hold_seating_unit_for_cart_by_layout" as never,
      rpcArgs as never,
    )
    if (
      error &&
      eventDateId &&
      /PGRST202|could not find the function|p_event_date_id/i.test(
        reserveRpcErrorText(error),
      )
    ) {
      logger.error({
        context: "checkout/cart-hold",
        message: "hold_layout_rpc_missing_event_date_id_arg",
        eventId,
        sectorId,
        layoutItemId,
        eventDateId,
        error: reserveRpcErrorText(error),
      })
      lastError = reserveRpcErrorText(error)
      continue
    }
    if (error) {
      lastError = reserveRpcErrorText(error)
      if (/missing_event_date_id/i.test(lastError)) {
        return { success: false, error: MISSING_EVENT_DATE_ID }
      }
      const mapped = mapReserveRpcError(lastError)
      if (mapped?.error === "out_of_stock") {
        return { success: false, error: mapped.error }
      }
      continue
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { reserved_until?: string; seating_unit_id?: string }
      | null
    const reservedUntil = row?.reserved_until
    const seatingUnitId = row?.seating_unit_id
    if (reservedUntil && seatingUnitId) {
      return { success: true, reservedUntil, seatingUnitId }
    }
  }

  if (lastError) {
    const mapped = mapReserveRpcError(lastError)
    if (mapped) {
      return { success: false, error: mapped.error }
    }
    logger.error({
      context: "checkout/cart-hold",
      message: "hold_seating_unit_for_cart_by_layout_failed",
      eventId,
      sectorId,
      layoutItemId,
      eventDateId,
      error: lastError,
    })
  }
  return { success: false, error: "not_materialized" }
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

  try {
    return await executeLockTickets(eventId, parsed.data.items, previewKey)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "")
    const mapped = mapReserveRpcError(message)
    if (mapped) {
      return {
        success: false,
        error: mapped.error,
        code: mapped.code,
        ticketId: mapped.ticketId,
      }
    }
    logger.error({
      context: "checkout/mixed-hold",
      message: "lock_tickets_unhandled",
      eventId,
      error: message,
    })
    return {
      success: false,
      error: "No se pudo reservar el stock. Probá de nuevo.",
    }
  }
}

async function executeLockTickets(
  eventId: string,
  cartItemsInput: CheckoutCartItem[],
  previewKey?: string | null,
): Promise<LockTicketsResult> {
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

  const room = await assertCheckoutWaitingRoom({
    eventId: access.eventId,
    eventSlug: access.eventSlug,
    bypass: access.useSandbox || Boolean(previewKey),
  })
  if (!room.ok) {
    return { success: false, error: room.error }
  }

  const allowed = await consumeNamedRateLimit("cartHoldUser", user.id)
  if (!allowed) {
    return {
      success: false,
      error: "Demasiados intentos. Esperá un momento y volvé a elegir.",
    }
  }

  const cartItems = cartItemsInput
  const allTierIds = [
    ...new Set(cartItems.map((item) => checkoutItemTierId(item))),
  ]

  const [eventRes, tiersRes, stockRes] = await Promise.all([
    access.db
      .from("events")
      .select("max_tickets_per_user, has_seating_plan")
      .eq("id", eventId)
      .maybeSingle(),
    access.db
      .from("ticket_tiers")
      .select(
        "id, name, min_purchase_limit, max_purchase_limit, seating_sector_id, layout_type",
      )
      .eq("event_id", eventId)
      .in("id", allTierIds),
    access.db.rpc("get_event_tier_live_stock", { p_event_id: eventId }),
  ])
  const holdEvent = eventRes.data
  const holdTiers = tiersRes.data
  const mappedSectors = (holdTiers ?? [])
    .filter(
      (tier) =>
        Boolean(tier.seating_sector_id?.trim()) &&
        layoutRequiresSeatSelection(tier.layout_type),
    )
    .map((tier) => String(tier.seating_sector_id).trim())
  const sectorsToInspect = [...new Set(mappedSectors)]
  const linkedSectors = new Set<string>()
  if (sectorsToInspect.length > 0) {
    const { data: unitRows } = await access.db
      .from("event_seating_units")
      .select("sector_id")
      .eq("event_id", eventId)
      .in("sector_id", sectorsToInspect)
    for (const row of unitRows ?? []) {
      if (row.sector_id) linkedSectors.add(row.sector_id)
    }
    if (mappedSectors.some((sectorId) => !linkedSectors.has(sectorId))) {
      return { success: false, error: SECTOR_NOT_CONFIGURED }
    }
  }

  const { mapItems, generalItems } = partitionMixedCartItems({
    items: cartItems,
    tiers: (holdTiers ?? []).map((tier) => ({
      id: tier.id,
      name: tier.name,
      layoutType: tier.layout_type,
      seatingSectorId: tier.seating_sector_id,
      hasMap: Boolean(tier.seating_sector_id?.trim()),
      isNumbered: layoutRequiresSeatSelection(tier.layout_type),
    })),
    linkedSectorIds: linkedSectors,
  })
  const numberedMapItems = mapItems.filter((item) => {
    const tier = (holdTiers ?? []).find(
      (row) => row.id === checkoutItemTierId(item),
    )
    return (
      item.isNumbered !== false &&
      item.is_numbered !== false &&
      tierIsNumbered({
        layoutType: tier?.layout_type,
        isNumbered: item.isNumbered ?? item.is_numbered,
      })
    )
  })
  const zoneGeneralItems = [
    ...generalItems,
    ...mapItems.filter((item) => !numberedMapItems.includes(item)),
  ]

  for (const item of numberedMapItems) {
    if (!checkoutItemSeatId(item) && !checkoutItemElementId(item)) {
      return checkoutActionFailure(
        "ERR_SEAT_REQUIRED",
        SEAT_SELECTION_REQUIRED,
        checkoutItemTierId(item),
      )
    }
  }

  const liveStockReady = !stockRes.error && Array.isArray(stockRes.data)
  const remainingByTier = new Map(
    (stockRes.data ?? []).map((row) => [
      row.tier_id,
      generalTierRemaining({
        capacity: row.capacity,
        sold: row.sold,
      }),
    ]),
  )
  const nameByTier = new Map(
    (holdTiers ?? []).map((tier) => [tier.id, tier.name?.trim() || ""]),
  )
  for (const item of zoneGeneralItems) {
    const tierId = checkoutItemTierId(item)
    const remaining = remainingByTier.get(tierId)
    if (liveStockReady && remaining != null && remaining < item.quantity) {
      return checkoutActionFailure(
        ERR_NO_STOCK,
        encodeGeneralStockUnavailable(nameByTier.get(tierId), tierId),
        tierId,
      )
    }
  }

  if (numberedMapItems.length === 0 && zoneGeneralItems.length === 0) {
    return checkoutActionFailure(ERR_NO_STOCK, "out_of_stock")
  }

  const holdCap = assertCartTierPurchaseLimits({
    items: cartItems.map((item) => ({
      tierId: checkoutItemTierId(item),
      quantity: item.quantity,
    })),
    tiers: (holdTiers ?? []).map((tier) => ({
      id: tier.id,
      name: tier.name,
      minPurchaseLimit: (tier as { min_purchase_limit?: number | null })
        .min_purchase_limit,
      maxPurchaseLimit: (tier as { max_purchase_limit?: number | null })
        .max_purchase_limit,
    })),
    fallbackMax: holdEvent?.max_tickets_per_user,
  })
  if (!holdCap.ok) {
    return { success: false, error: holdCap.error }
  }

  const saleGate = await evaluateCartSaleWindows(
    access.db,
    eventId,
    cartItems,
  )
  if (saleGate && !saleGate.success) {
    return { success: false, error: saleGate.error }
  }

  const rpcItems = cartItems.map((item) => toReserveRpcItem(item))
  const mixed = await access.db.rpc("hold_mixed_cart_for_checkout", {
    p_event_id: eventId,
    p_owner_id: user.id,
    p_items: rpcItems,
  })
  const mixedMissing = Boolean(
    mixed.error &&
      /could not find|schema cache|does not exist|pgrst202|42883|hold_mixed_cart/i.test(
        mixed.error.message,
      ),
  )

  let data = mixed.data
  let error = mixedMissing ? null : mixed.error

  if (mixedMissing) {
    let gaHeld = false
    const heldSeatIds: string[] = []
    if (zoneGeneralItems.length > 0) {
      const gaPayload = zoneGeneralItems
        .map((item) => ({
          type: "general" as const,
          ticket_tier_id: checkoutItemTierId(item),
          tier_id: checkoutItemTierId(item),
          quantity: item.quantity,
        }))
      if (gaPayload.length > 0) {
        const ga = await access.db.rpc("hold_ga_tickets_for_cart", {
          p_event_id: eventId,
          p_owner_id: user.id,
          p_items: gaPayload,
        })
        data = ga.data
        error = ga.error
        gaHeld = !ga.error
      }
    }
    if (!error) {
      for (const item of numberedMapItems) {
        const seatId = checkoutItemSeatId(item)
        if (!seatId) {
          if (gaHeld) {
            await access.db.rpc("release_ga_cart_holds", {
              p_event_id: eventId,
              p_owner_id: user.id,
            })
          }
          return checkoutActionFailure(
            "ERR_SEAT_REQUIRED",
            SEAT_SELECTION_REQUIRED,
            checkoutItemTierId(item),
          )
        }
        const held = await access.db.rpc("hold_seating_unit_for_cart", {
          p_event_id: eventId,
          p_owner_id: user.id,
          p_seating_unit_id: seatId,
        })
        if (held.error) {
          error = held.error
          break
        }
        heldSeatIds.push(seatId)
        const heldRow = Array.isArray(held.data) ? held.data[0] : held.data
        if (heldRow?.reserved_until && !data) {
          data = [{ reserved_until: heldRow.reserved_until }]
        }
      }
    }
    if (error && (gaHeld || heldSeatIds.length > 0)) {
      if (gaHeld) {
        const released = await access.db.rpc("release_ga_cart_holds", {
          p_event_id: eventId,
          p_owner_id: user.id,
        })
        if (released.error) {
          logger.error({
            context: "checkout/mixed-hold",
            message: "release_ga_cart_holds_after_partial_failed",
            eventId,
            error: released.error.message,
          })
        }
      }
      for (const seatId of heldSeatIds) {
        const released = await access.db.rpc("release_seating_unit_cart_hold", {
          p_event_id: eventId,
          p_owner_id: user.id,
          p_seating_unit_id: seatId,
        })
        if (released.error) {
          logger.error({
            context: "checkout/mixed-hold",
            message: "release_seating_unit_after_partial_failed",
            eventId,
            seatingUnitId: seatId,
            error: released.error.message,
          })
        }
      }
    }
  }

  if (error) {
    const mapped = mapReserveRpcError(reserveRpcErrorText(error))
    if (mapped) {
      if (mapped.error === "out_of_stock" && zoneGeneralItems.length > 0) {
        const tierId = checkoutItemTierId(zoneGeneralItems[0]!)
        const name = nameByTier.get(tierId)
        return checkoutActionFailure(
          ERR_NO_STOCK,
          encodeGeneralStockUnavailable(name, tierId),
          tierId,
        )
      }
      return {
        success: false,
        error: mapped.error,
        code: mapped.code,
        ticketId: mapped.ticketId,
      }
    }
    logger.error({
      context: "checkout/mixed-hold",
      message: "hold_mixed_cart_failed",
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
  if (!reservedUntil && mapItems.length === 0) {
    const tierId = checkoutItemTierId(generalItems[0]!)
    return checkoutActionFailure(
      ERR_NO_STOCK,
      encodeGeneralStockUnavailable(nameByTier.get(tierId), tierId),
      tierId,
    )
  }
  if (!reservedUntil) {
    return checkoutActionFailure(ERR_SEAT_TAKEN, SEAT_UNAVAILABLE)
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

  if (input.sandbox) {
    const gate = await admin
      .from("orders")
      .update({
        ...orderTestFlags(true),
        legal_consent_required: false,
      })
      .eq("id", input.orderId)
      .eq("buyer_id", input.buyerId)

    if (gate.error) {
      logger.warn({
        context: "checkout/legal",
        message: "sandbox_legal_gate_update_failed",
        orderId: input.orderId,
        error: gate.error.message,
      })
      await admin
        .from("orders")
        .update(orderTestFlags(true))
        .eq("id", input.orderId)
        .eq("buyer_id", input.buyerId)
      const legalOnly = await admin
        .from("orders")
        .update({ legal_consent_required: false })
        .eq("id", input.orderId)
        .eq("buyer_id", input.buyerId)
      if (legalOnly.error) {
        logger.error({
          context: "checkout/legal",
          message: "sandbox_legal_flag_failed",
          orderId: input.orderId,
          error: legalOnly.error.message,
        })
      }
    }

    return { ok: true }
  }

  const patch = canRecord
    ? {
        legal_consent_required: true,
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        legal_terms_version: EVENT_LEGAL_TERMS_VERSION,
        organizer_legal_name_snapshot: legalName,
        organizer_tax_id_snapshot: taxId,
      }
    : { legal_consent_required: false }

  if (!canRecord) {
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
      error: "No se pudo completar tu compra. Intentá de nuevo.",
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

  const ctx = await getCheckoutRequestContext()
  const captcha = await verifyCheckoutCaptcha({
    token: security?.captchaToken,
    ip: ctx.ip,
    skip: false,
  })
  if (!captcha.ok) {
    return { success: false, error: captcha.error || CHECKOUT_VERIFY_ERROR }
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

  if (
    unitError ||
    !unit ||
    (unit.status !== "available" && unit.status !== "reserved")
  ) {
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
    captchaToken?: string | null
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
    displayedTotal?: number
    idempotencyKey?: string | null
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
    displayedTotal: options?.displayedTotal,
    idempotencyKey: options?.idempotencyKey,
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
        "Las compras de prueba solo están disponibles antes de que el evento esté en venta.",
    }
  }
  const useSandbox = access.useSandbox || Boolean(payload.sandbox)
  const db = access.db

  const room = await assertCheckoutWaitingRoom({
    eventId: access.eventId,
    eventSlug: access.eventSlug,
    bypass: access.useSandbox || Boolean(payload.previewKey || payload.sandbox),
  })
  if (!room.ok) {
    return { success: false, error: room.error }
  }

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
    return { success: false, error: resolvedCart.error }
  }
  const cartItems = resolvedCart.items
  const seatingItems = cartItems.filter((item) => isMappedCheckoutItem(item))

  const user = earlyUser

  const checkoutAllowed = await consumeNamedRateLimit("checkoutUser", user.id)
  if (!checkoutAllowed) {
    return {
      success: false,
      error:
        "Has superado el límite de intentos de compra. Por favor, espera unos minutos.",
    }
  }

  const [eventResult, { data: eventTiers }] = await Promise.all([
    db
      .from("events")
      .select(
        "date, ends_at, schedule_days, title, max_tickets_per_user, accepts_mercado_pago",
      )
      .eq("id", payload.eventId)
      .maybeSingle(),
    db
      .from("ticket_tiers")
      .select(
        "id, name, capacity, sold, visibility, min_purchase_limit, max_purchase_limit",
      )
      .eq("event_id", payload.eventId),
  ])
  let eventRow = eventResult.data as {
    date: string
    ends_at: string | null
    schedule_days: unknown
    title: string
    max_tickets_per_user: number | null
    accepts_mercado_pago?: boolean | null
  } | null
  if (
    eventResult.error &&
    /accepts_mercado_pago|schema cache|PGRST204|42703/i.test(
      eventResult.error.message,
    )
  ) {
    const retry = await db
      .from("events")
      .select("date, ends_at, schedule_days, title, max_tickets_per_user")
      .eq("id", payload.eventId)
      .maybeSingle()
    eventRow = retry.data as typeof eventRow
  }

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

  if (
    payload.paymentProvider === "mercadopago" &&
    !eventAcceptsMercadoPago(eventRow?.accepts_mercado_pago)
  ) {
    return {
      success: false,
      error: "Este evento no acepta cobro con Mercado Pago.",
    }
  }

  if (isSoldOut({ tiers: eventTiers })) {
    return { success: false, error: EVENT_SOLD_OUT_ERROR }
  }

  const skuCap = assertCartTierPurchaseLimits({
    items: cartItems.map((item) => ({
      tierId: checkoutItemTierId(item),
      quantity: item.quantity,
    })),
    tiers: (eventTiers ?? []).map((tier) => ({
      id: "id" in tier && typeof tier.id === "string" ? tier.id : "",
      name: "name" in tier && typeof tier.name === "string" ? tier.name : "",
      minPurchaseLimit:
        "min_purchase_limit" in tier
          ? (tier.min_purchase_limit as number | null)
          : 1,
      maxPurchaseLimit:
        "max_purchase_limit" in tier
          ? (tier.max_purchase_limit as number | null)
          : null,
    })),
    fallbackMax: eventRow?.max_tickets_per_user,
  })
  if (!skuCap.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: skuCap.error }
  }

  const stockCap = assertCartRemainingStock({
    items: cartItems
      .filter((item) => !isMappedCheckoutItem(item))
      .map((item) => ({
      tierId: checkoutItemTierId(item),
      quantity: item.quantity,
    })),
    tiers: (eventTiers ?? []).map((tier) => ({
      id: "id" in tier && typeof tier.id === "string" ? tier.id : "",
      name: "name" in tier && typeof tier.name === "string" ? tier.name : "",
      capacity:
        "capacity" in tier ? (tier.capacity as number | null) : null,
      sold: "sold" in tier ? (tier.sold as number | null) : null,
    })),
  })
  if (!stockCap.ok) {
    await recordCheckoutFailure(ctx)
    const general = cartItems.find((item) => !isMappedCheckoutItem(item))
    const generalName = (eventTiers ?? []).find(
      (tier) =>
        "id" in tier &&
        general != null &&
        tier.id === checkoutItemTierId(general),
    )
    const label =
      generalName && "name" in generalName && typeof generalName.name === "string"
        ? generalName.name
        : null
    const stockTierId =
      general && "ticket_tier_id" in general
        ? checkoutItemTierId(general)
        : undefined
    return checkoutActionFailure(
      ERR_NO_STOCK,
      encodeGeneralStockUnavailable(label, stockTierId),
      stockTierId,
    )
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

  // Nunca confiar en promoter_id del cliente. Cupón con RRPP pisa cookie/?rrpp=.
  const promoterId = await resolveCheckoutPromoterId({
    supabase,
    eventId: payload.eventId,
    referralCode: payload.referralCode,
    promoCodeId: payload.promoCodeId,
  })

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

  const displayedTotal = payload.displayedTotal ?? options?.displayedTotal
  const idempotencyKey = payload.idempotencyKey ?? options?.idempotencyKey ?? null
  const cartFingerprint = checkoutCartFingerprint(cartItems)
  if (
    !payload.promoCodeId &&
    !displayedTotalMatchesServer(displayedTotal, quoted.total)
  ) {
    await recordCheckoutFailure(ctx)
    return checkoutActionFailure(
      CHECKOUT_FEEDBACK_CODE.ERR_PRICE_CHANGED,
      CHECKOUT_PRICES_CHANGED_ERROR,
    )
  }

  const isFreeOrder = quoted.total === 0
  if (!isFreeOrder && !buyer.buyerPhone.trim()) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: PHONE_ERROR }
  }
  if (
    !checkoutTermsAreAccepted({
      termsAccepted: payload.termsAccepted,
      isFreeOrder,
      sandbox: useSandbox,
    })
  ) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: LEGAL_CONSENT_REQUIRED_ERROR }
  }

  let captchaProvider: string | null = "none"
  let captchaScore: number | null = null
  if (!useSandbox && !isFreeOrder) {
    const captcha = await verifyCheckoutCaptcha({
      token: options?.captchaToken,
      ip: ctx.ip,
      skip: false,
    })
    if (!captcha.ok) {
      await recordCheckoutFailure(ctx)
      return { success: false, error: captcha.error || CHECKOUT_VERIFY_ERROR }
    }
    captchaProvider = captcha.provider
    captchaScore = captcha.score
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
  let resumedPromoCodeId: string | null = null
  let resumedRows: ReserveTxRow[] | null = null

  if (idempotencyKey) {
    const claim = await claimCheckoutIdempotencyKey(db, {
      buyerId: user.id,
      eventId: payload.eventId,
      key: idempotencyKey,
      fingerprint: cartFingerprint,
    })
    if (claim.kind === "mismatch") {
      return { success: false, error: CHECKOUT_IDEMPOTENCY_CART_MISMATCH_ERROR }
    }
    if (claim.kind === "in_progress") {
      return { success: false, error: CHECKOUT_IN_PROGRESS_ERROR }
    }
    if (claim.kind === "reused" && claim.status === "paid") {
      const successUrl = `/checkout/success?order_id=${claim.orderId}`
      return {
        success: true,
        tickets: [],
        orderId: claim.orderId,
        initPoint: successUrl,
        paymentUrl: successUrl,
        expiresAt: new Date().toISOString(),
      }
    }
    if (claim.kind === "reused") {
      const resumed = await loadReusableCheckoutOrder(db, {
        orderId: claim.orderId,
        buyerId: user.id,
        fingerprint: cartFingerprint,
      })
      resumedRows = resumed?.rows ?? null
      resumedPromoCodeId = resumed?.promoCodeId ?? null
    }
  }

  if (!resumedRows) {
    const reusable = await findReusablePendingCheckoutOrder(db, {
      userId: user.id,
      eventId: payload.eventId,
      fingerprint: cartFingerprint,
    })
    if (reusable) {
      resumedRows = reusable.rows
      resumedPromoCodeId = reusable.promoCodeId
    }
  }

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

    const saleGate = await evaluateCartSaleWindows(
      db,
      payload.eventId,
      cartItems,
    )
    if (saleGate) return saleGate

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
    const addonItems = payload.addons.map((addon) => ({
      item_id: addon.itemId,
      quantity: addon.quantity,
    }))

    const denylistGate = await db.rpc("assert_buyer_not_denylisted", {
      p_holder_dni: buyer.buyerDni,
      p_holder_email: buyer.buyerEmail,
    })
    if (
      denylistGate.error &&
      !/could not find|schema cache|does not exist/i.test(
        denylistGate.error.message,
      )
    ) {
      const mapped = mapReserveRpcError(
        reserveRpcErrorText(denylistGate.error),
      )
      if (mapped) return mapped
    }

    if (resumedRows) {
      reservation = { data: resumedRows, error: null }
    } else if (isGaOnly) {
      const claimed = await db.rpc("claim_and_reserve_ga_cart_tx", {
        p_event_id: payload.eventId,
        p_owner_id: user.id,
        p_items: rpcItems,
        p_promoter_id: promoterId,
        p_holder_dni: buyer.buyerDni,
        p_holder_email: buyer.buyerEmail,
        p_addons: addonItems,
      })
      const missingClaim = Boolean(
        claimed.error &&
          /could not find|schema cache|does not exist/i.test(
            claimed.error.message,
          ),
      )
      if (!missingClaim) {
        reservation = claimed
      } else if (addonItems.length > 0) {
        reservation = {
          data: null,
          error: { message: "No se pudieron reservar las consumiciones." },
        }
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
        p_holder_dni: buyer.buyerDni,
        p_holder_email: buyer.buyerEmail,
        p_addons: addonItems,
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
            p_holder_dni: buyer.buyerDni,
            p_holder_email: buyer.buyerEmail,
            p_addons: addonItems,
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
    await attachCheckoutIdempotencyOrder(db, {
      buyerId: user.id,
      key: idempotencyKey,
      orderId,
    })
    const reservedRow = rows[0] as ReserveTxRow & Partial<AtomicReserveRow>
    const reservedMerchandise = Number(
      reservedRow.total_amount ??
        (reservedRow.unit_price ?? 0) * (reservedRow.quantity ?? 0),
    )
    const skipReservedQuoteCheck = Boolean(resumedRows && resumedPromoCodeId)
    if (
      !skipReservedQuoteCheck &&
      (!Number.isFinite(reservedMerchandise) ||
        !amountsMatch(reservedMerchandise, quoted.total))
    ) {
      await cleanupPendingOrder(orderId)
      logger.error({
        context: "checkout/reservation",
        message: "server_price_mismatch",
        eventId: payload.eventId,
        quoted: quoted.total,
        reserved: reservedMerchandise,
      })
      return checkoutActionFailure(
        CHECKOUT_FEEDBACK_CODE.ERR_PRICE_CHANGED,
        CHECKOUT_PRICES_CHANGED_ERROR,
      )
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
      captchaProvider,
      captchaScore,
    })

    const cleanPromoId = resumedPromoCodeId ? null : payload.promoCodeId
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

      const couponPromoterId = await resolveCheckoutPromoterId({
        supabase,
        eventId: payload.eventId,
        promoCodeId: cleanPromoId,
      })
      if (couponPromoterId) {
        await attachPromoterToPendingOrder({
          orderId,
          buyerId: user.id,
          promoterId: couponPromoterId,
        })
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
    if (!displayedTotalMatchesServer(displayedTotal, finalTotal)) {
      await cleanupPendingOrder(orderId)
      logger.error({
        context: "checkout/reservation",
        message: "displayed_total_mismatch",
        eventId: payload.eventId,
        displayed: displayedTotal,
        charged: finalTotal,
      })
      return checkoutActionFailure(
        CHECKOUT_FEEDBACK_CODE.ERR_PRICE_CHANGED,
        CHECKOUT_PRICES_CHANGED_ERROR,
      )
    }

    let initPoint: string
    const reservedUntil = rows[0]?.reserved_until
    const checkoutExpiresAt = resolveCheckoutExpiresAt(reservedUntil).toISOString()

    const legalGate = await persistOrderLegalGate({
      orderId,
      eventId: payload.eventId,
      buyerId: user.id,
      sandbox: useSandbox,
      termsAccepted: checkoutTermsAreAccepted({
        termsAccepted: payload.termsAccepted,
        isFreeOrder,
        sandbox: useSandbox,
      }),
    })
    if (!legalGate.ok) {
      await cleanupPendingOrder(orderId)
      return { success: false, error: legalGate.error }
    }

    if (useSandbox) {
      const admin = createAdminClient()
      const sandboxRpc = await admin.rpc("finalize_sandbox_paid_order", {
        p_order_id: orderId,
      })
      const missingSandboxRpc = Boolean(
        sandboxRpc.error &&
          /could not find|schema cache|does not exist/i.test(
            sandboxRpc.error.message,
          ),
      )

      let finalizeError = sandboxRpc.error
      let result = (sandboxRpc.data ?? {}) as { ok?: boolean; code?: string }

      if (missingSandboxRpc) {
        await admin
          .from("orders")
          .update({
            ...orderTestFlags(true),
            legal_consent_required: false,
          })
          .eq("id", orderId)
          .eq("buyer_id", user.id)
        const classic = await admin.rpc("finalize_paid_order", {
          p_order_id: orderId,
          p_mp_payment_id: `sandbox:${orderId}`,
        })
        finalizeError = classic.error
        result = (classic.data ?? {}) as { ok?: boolean; code?: string }
        if (!finalizeError && result.ok) {
          const { error: markError } = await admin.rpc(
            "mark_order_test_sandbox",
            { p_order_id: orderId },
          )
          if (markError) {
            logger.error({
              context: "checkout/sandbox",
              message: "sandbox_mark_failed",
              orderId,
              error: markError.message,
            })
          }
        }
      }

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

      initPoint = `/checkout/success?order_id=${orderId}&sandbox=1`
    } else if (Number.isFinite(finalTotal) && finalTotal <= 0) {
      // Gratis: emitir con finalize_paid_order. Nunca abrir pasarela.
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

      const stockGate = await assertPendingOrderStillReservable(db, orderId)
      if (!stockGate.ok) {
        await cleanupPendingOrder(orderId)
        return { success: false, error: stockGate.error }
      }

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
          description: `${eventRow?.title ?? "TokePass"} — entradas`.slice(
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
              title: `${eventRow?.title ?? "TokePass"} — entradas`,
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
        "Las compras de prueba solo están disponibles antes de que el evento esté en venta.",
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
  try {
    const allowed = await assertSandboxCheckoutAllowed(
      eventId,
      user.id,
      previewKey,
    )
    return allowed.ok
  } catch {
    return false
  }
}

/**
 * Compra de prueba (Modo Sandbox): reserva atómica y éxito sin Getnet/Mobbex/MP.
 * Si el payload Zod (nombre, email, DNI y carrito) es válido, no contacta la pasarela.
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
  captchaToken?: string | null,
  guard?: {
    displayedTotal?: number
    idempotencyKey?: string | null
  },
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
    displayedTotal: guard?.displayedTotal,
    idempotencyKey: guard?.idempotencyKey,
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
      termsAccepted: checkoutTermsAreAccepted({
        termsAccepted: parsed.data.termsAccepted,
        sandbox: true,
      }),
      captchaToken,
      displayedTotal: parsed.data.displayedTotal ?? guard?.displayedTotal,
      idempotencyKey: parsed.data.idempotencyKey ?? guard?.idempotencyKey,
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
