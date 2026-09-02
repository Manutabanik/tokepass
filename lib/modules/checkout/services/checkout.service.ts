import { revalidatePath } from "next/cache"

import {
  resolveCheckoutExpiresAt,
} from "@/lib/checkout-hold"
import { releaseWaitingRoomPassFromCookies } from "@/lib/waiting-room/release"
import {
  type CheckoutBuyerInfo,
  type NormalizedCheckoutBuyer,
} from "@/lib/checkout-buyer"
import { normalizeCheckoutHoldSessionId } from "@/lib/checkout/hold-session"
import { resolveInvisibleCheckoutBuyer } from "@/lib/checkout/invisible-buyer"
import { PHONE_ERROR } from "@/lib/checkout/guest-input"
import {
  decidePhaseCart,
  isPhaseStockError,
} from "@/lib/inventory/active-phase"
import { isPastEvent, isSoldOut } from "@/lib/event-status"
import { eventAcceptsMercadoPago } from "@/lib/events/checkout-policy"
import { fulfillSandboxPaidOrder } from "@/lib/checkout/sandbox-fulfillment"
import { shouldFallbackSandboxFinalize } from "@/lib/checkout/sandbox-finalize"
import { orderTestFlags } from "@/lib/finance/order-test-flags"
import { logger } from "@/lib/logger"
import { captureCriticalException } from "@/lib/sentry/capture"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"
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
  checkoutPreferenceUndersellsQuote,
  clientCheckoutMoneyMatchesQuoted,
} from "@/lib/checkout/checkout-money"
import {
  CHECKOUT_PRICES_CHANGED_ERROR,
  displayedTotalMatchesServer,
} from "@/lib/checkout/price-guard"
import {
  ERR_NO_STOCK,
  SEAT_SELECTION_REQUIRED,
  encodeGeneralStockUnavailable,
  layoutRequiresSeatSelection,
} from "@/lib/checkout/revalidate-seat-holds"
import {
  assertCartHasAdmissionSku,
  assertLoadedCheckoutTiersCoverCart,
} from "@/lib/checkout/sellable-tickets"
import {
  assertSeatedCartItemsHaveUnits,
} from "@/lib/checkout/mixed-cart"
import {
  reserveRpcErrorText,
} from "@/lib/checkout/lock-timeout"
import {
  CHECKOUT_VERIFY_ERROR,
  verifyCheckoutCaptcha,
} from "@/lib/checkout/bot-guard"
import { getCheckoutRequestContext } from "@/lib/checkout/request-context"
import { consumeNamedRateLimit } from "@/lib/security/distributed-rate-limit"
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
import { createAdminClient, tryCreateAdminClient } from "@/lib/supabase/admin"
import {
  amountsMatch,
  checkoutItemSeatId,
  checkoutItemTierId,
  isMappedCheckoutItem,
  toReserveRpcItem,
} from "@/lib/checkout/hybrid-cart"
import {
  sortReserveRpcItems,
} from "@/lib/checkout/lock-order"
import {
  assertCartRemainingStock,
  assertCartTierPurchaseLimits,
} from "@/lib/checkout-limits"
import {
  CheckoutPayloadSchema,
  buyerToHolderFields,
  checkoutTermsAreAccepted,
  formatCheckoutPayloadError,
  type CheckoutAddonItem,
  type CheckoutCartItemInput,
} from "@/lib/validations/checkout"
import type {
  AtomicReserveRow,
  CheckoutResult,
  CheckoutSupabase,
  ReserveTxRow,
  ReservedTicket,
} from "@/lib/modules/checkout/types/checkout.types"
import {
  EVENT_FINISHED_ERROR,
  EVENT_SOLD_OUT_ERROR,
  GENERIC_CHECKOUT_ERROR,
} from "@/lib/modules/checkout/constants/checkout-errors"
import {
  evaluateCartPhaseRollover,
  evaluateCartSaleWindows,
  loadCheckoutTierCommerce,
  loadCheckoutTierPhases,
  reserveGeneralAdmissionAtomic,
  resolveMappedSeatingUnits,
  resolvePhaseRolloverAfterError,
} from "@/lib/modules/checkout/services/inventory.service"
import {
  persistOrderFeeLedger,
  quoteCheckoutFromDatabase,
} from "@/lib/modules/checkout/services/pricing.service"
import { mapReserveRpcError } from "@/lib/modules/checkout/errors/map-reserve-error"
import { openCheckoutPaymentSession } from "@/lib/modules/checkout/services/payment.service"
import {
  assertCheckoutWaitingRoom,
  resolveCheckoutEventAccess,
  transferGuestHoldsToBuyer,
} from "@/lib/modules/checkout/services/access.service"

function formatCheckoutDbError(error: {
  message?: string
  details?: string
  hint?: string
  code?: string
} | null | undefined): string {
  if (!error) return ""
  return [error.message, error.details, error.hint]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" — ")
}

function sandboxOrFallback(sandbox: boolean, detail: string, fallback: string) {
  const text = detail.trim()
  if (sandbox && text) return text
  return fallback
}

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

    const { error: ticketFlagError } = await admin
      .from("tickets")
      .update({ is_test: true })
      .eq("order_id", input.orderId)
    if (ticketFlagError) {
      logger.warn({
        context: "checkout/legal",
        message: "sandbox_ticket_flag_failed",
        orderId: input.orderId,
        error: ticketFlagError.message,
      })
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
    subtotal?: number
    serviceFee?: number
    grandTotal?: number
    ticketPrice?: number
    feeAmount?: number
    customerTotal?: number
    lineQuotes?: Array<{
      ticketTierId?: string | null
      quantity: number
      basePrice: number
      feeAmount: number
      finalPrice: number
    }>
    idempotencyKey?: string | null
    cartSessionId?: string | null
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
    subtotal: options?.subtotal,
    serviceFee: options?.serviceFee,
    grandTotal: options?.grandTotal,
    ticketPrice: options?.ticketPrice,
    feeAmount: options?.feeAmount,
    customerTotal: options?.customerTotal,
    lineQuotes: options?.lineQuotes,
    idempotencyKey: options?.idempotencyKey,
    cartSessionId: options?.cartSessionId,
  })
  if (!parsed.success) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }

  const payload = parsed.data
  const buyer = buyerToHolderFields(payload.buyer) satisfies NormalizedCheckoutBuyer

  const invisible = await resolveInvisibleCheckoutBuyer(buyer)
  if (!invisible.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: invisible.error }
  }

  const access = await resolveCheckoutEventAccess({
    eventId: payload.eventId,
    userId: invisible.userId,
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
  let db = access.db
  if (!invisible.signedIn) {
    const adminDb = tryCreateAdminClient() as CheckoutSupabase | null
    if (!adminDb) {
      return {
        success: false,
        error:
          "No se pudo preparar la compra de invitado. Falta la clave de servicio.",
      }
    }
    db = adminDb
  }

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

  const user = { id: invisible.userId }
  const transferred = await transferGuestHoldsToBuyer({
    eventId: payload.eventId,
    sessionId: payload.cartSessionId,
    buyerId: user.id,
  })
  if (!transferred.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: transferred.error }
  }

  const checkoutAllowed = await consumeNamedRateLimit("checkoutUser", user.id)
  if (!checkoutAllowed) {
    return {
      success: false,
      error:
        "Has superado el límite de intentos de compra. Por favor, espera unos minutos.",
    }
  }

  const [eventResult, tiersFirst] = await Promise.all([
    db
      .from("events")
      .select(
        "date, ends_at, schedule_days, title, max_tickets_per_user, accepts_mercado_pago, has_seating_plan",
      )
      .eq("id", payload.eventId)
      .maybeSingle(),
    db
      .from("ticket_tiers")
      .select(
        "id, name, capacity, sold, visibility, min_purchase_limit, max_purchase_limit, ticket_type, tier_type, category",
      )
      .eq("event_id", payload.eventId),
  ])
  type CheckoutSoldOutTier = {
    id: string
    name: string
    capacity: number
    sold: number
    visibility: "public" | "private"
    min_purchase_limit: number
    max_purchase_limit: number | null
    ticket_type?: string | null
    tier_type?: string | null
    category?: string | null
  }
  let eventTiers = (tiersFirst.data ?? null) as CheckoutSoldOutTier[] | null
  if (
    tiersFirst.error &&
    /ticket_type|tier_type|category|schema cache|PGRST204|42703/i.test(
      tiersFirst.error.message,
    )
  ) {
    const retry = await db
      .from("ticket_tiers")
      .select(
        "id, name, capacity, sold, visibility, min_purchase_limit, max_purchase_limit, tier_type, category",
      )
      .eq("event_id", payload.eventId)
    eventTiers = (
      retry.error
        ? (
            await db
              .from("ticket_tiers")
              .select(
                "id, name, capacity, sold, visibility, min_purchase_limit, max_purchase_limit",
              )
              .eq("event_id", payload.eventId)
          ).data
        : retry.data
    ) as CheckoutSoldOutTier[] | null
  }
  let eventRow = eventResult.data as {
    date: string
    ends_at: string | null
    schedule_days: unknown
    title: string
    max_tickets_per_user: number | null
    accepts_mercado_pago?: boolean | null
    has_seating_plan?: boolean | null
  } | null
  if (
    eventResult.error &&
    /accepts_mercado_pago|has_seating_plan|schema cache|PGRST204|42703/i.test(
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
  await db
    .from("profiles")
    .update({
      full_name: buyer.buyerName,
      dni: buyer.buyerDni,
      phone: buyer.buyerPhone || null,
    })
    .eq("id", user.id)

  // Nunca confiar en promoter_id del cliente. Cupón con RRPP pisa cookie/?rrpp=.
  const promoterId = await resolveCheckoutPromoterId({
    supabase: db,
    eventId: payload.eventId,
    referralCode: payload.referralCode,
    promoCodeId: payload.promoCodeId,
  })

  const tierIds = [...new Set(cartItems.map((item) => checkoutItemTierId(item)))]
  const tierMetaRes = await loadCheckoutTierCommerce(
    db,
    payload.eventId,
    tierIds,
  )
  if (!tierMetaRes.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: tierMetaRes.error }
  }
  const tierMeta = tierMetaRes.rows
  const covered = assertLoadedCheckoutTiersCoverCart(tierIds, tierMeta)
  if (!covered.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: covered.error }
  }

  const eventHasSeatingPlan = eventRow?.has_seating_plan !== false
  const seatedCart = assertSeatedCartItemsHaveUnits(
    cartItems,
    tierMeta.map((row) => ({
      id: row.id,
      layoutType: eventHasSeatingPlan ? row.layout_type : "general",
    })),
  )
  if (!seatedCart.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: SEAT_SELECTION_REQUIRED }
  }

  const extrasGate = assertCartHasAdmissionSku(cartItems.length, tierMeta)
  if (!extrasGate.ok) {
    await recordCheckoutFailure(ctx)
    return { success: false, error: extrasGate.error }
  }

  const sectorByTier = new Map(
    tierMeta.map((row) => [row.id, row.seating_sector_id]),
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
    return checkoutActionFailure(
      CHECKOUT_FEEDBACK_CODE.ERR_PRICE_CHANGED,
      CHECKOUT_PRICES_CHANGED_ERROR,
    )
  }

  const displayedTotal =
    payload.grandTotal ??
    payload.displayedTotal ??
    options?.grandTotal ??
    options?.displayedTotal
  const idempotencyKey = payload.idempotencyKey ?? options?.idempotencyKey ?? null
  const cartFingerprint = checkoutCartFingerprint(cartItems)
  if (
    !clientCheckoutMoneyMatchesQuoted(
      {
        displayedTotal,
        subtotal: payload.subtotal ?? options?.subtotal,
        serviceFee: payload.serviceFee ?? options?.serviceFee,
        grandTotal: payload.grandTotal ?? options?.grandTotal ?? displayedTotal,
        ticketPrice: payload.ticketPrice ?? options?.ticketPrice,
        feeAmount: payload.feeAmount ?? options?.feeAmount,
        customerTotal:
          payload.customerTotal ?? options?.customerTotal ?? displayedTotal,
      },
      quoted.quote,
      { skipPrePromoTotal: Boolean(payload.promoCodeId) },
    )
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

  const seatedIds = [
    ...new Set(
      cartItems
        .map((item) => checkoutItemSeatId(item))
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const unitSectorById = new Map<string, string>()
  if (seatedIds.length > 0) {
    const { data: units } = await db
      .from("event_seating_units")
      .select("id, sector_id")
      .eq("event_id", payload.eventId)
      .in("id", seatedIds)
    for (const unit of units ?? []) {
      if (unit.sector_id) unitSectorById.set(unit.id, unit.sector_id)
    }
  }

  const rpcItems = sortReserveRpcItems(
    cartItems.map((item) => {
      const tierId = checkoutItemTierId(item)
      const decision = decidePhaseCart(
        phasesByTier.get(tierId) ?? [],
        item.quantity,
      )
      const seatId = checkoutItemSeatId(item)
      const tier = (tierMeta ?? []).find((row) => row.id === tierId)
      const tierSector = sectorByTier.get(tierId)
      const allowed = new Set<string>()
      if (tierSector) allowed.add(tierSector)
      return toReserveRpcItem(item, {
        sectorKey: item.sectorKey ?? tierSector ?? null,
        unitSectorId: seatId ? (unitSectorById.get(seatId) ?? null) : null,
        allowedSectorKeys: allowed,
        phaseId: decision.kind === "ok" ? decision.phase.id : null,
        isNumbered:
          eventHasSeatingPlan && layoutRequiresSeatSelection(tier?.layout_type),
        hasMap: eventHasSeatingPlan && Boolean(tierSector?.trim()),
      })
    }),
  )

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
      if (useSandbox) {
        await fulfillSandboxPaidOrder(claim.orderId)
        const successUrl = `/checkout/success?order_id=${claim.orderId}&sandbox=1`
        return {
          success: true,
          tickets: [],
          orderId: claim.orderId,
          initPoint: successUrl,
          paymentUrl: successUrl,
          expiresAt: new Date().toISOString(),
        }
      }
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
      const purchased = await db.rpc("purchase_held_seats_tx", {
        p_event_id: payload.eventId,
        p_owner_id: user.id,
        p_session_id:
          normalizeCheckoutHoldSessionId(payload.cartSessionId) ?? user.id,
        p_items: rpcItems,
        p_promoter_id: promoterId,
        p_holder_dni: buyer.buyerDni,
        p_holder_email: buyer.buyerEmail,
        p_addons: addonItems,
      })
      const missingPurchase = Boolean(
        purchased.error &&
          /could not find|schema cache|does not exist/i.test(
            purchased.error.message,
          ),
      )
      if (!missingPurchase) {
        reservation = purchased
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
        error: sandboxOrFallback(
          useSandbox,
          formatCheckoutDbError(error),
          "No se pudo completar la reserva. Intentá nuevamente.",
        ),
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
        !amountsMatch(reservedMerchandise, quoted.quote.ticketPrice))
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

    const feeLedgerOk = await persistOrderFeeLedger(orderId, quoted.quote)
    if (!feeLedgerOk) {
      await cleanupPendingOrder(orderId)
      logger.error({
        context: "checkout/reservation",
        message: "fee_ledger_persist_aborted",
        orderId,
      })
      return {
        success: false,
        error: "No se pudo congelar el total de la orden.",
      }
    }

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
        const promoMessage = promoError?.message ?? promoResult?.message ?? ""
        logger.error({
          context: "checkout/promo",
          message: "promo_apply_failed",
          orderId,
          error: promoMessage,
        })
        if (/promo_max_uses|agotó sus usos/i.test(promoMessage)) {
          return {
            success: false,
            error: "Este cupón agotó sus usos.",
          }
        }
        return {
          success: false,
          error: "No se pudo aplicar el cupón.",
        }
      }

      const couponPromoterId = await resolveCheckoutPromoterId({
        supabase: db,
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
      .select("total_amount, subtotal, service_charge, discount_amount")
      .eq("id", orderId)
      .eq("buyer_id", user.id)
      .maybeSingle()

    if (pricedOrderError || !pricedOrder) {
      await cleanupPendingOrder(orderId)
      return {
        success: false,
        error: sandboxOrFallback(
          useSandbox,
          formatCheckoutDbError(pricedOrderError),
          "No se pudo validar el total final de la orden.",
        ),
      }
    }

    const finalTotal = Number(pricedOrder.total_amount)
    const finalSubtotal = Number(pricedOrder.subtotal)
    const finalFee = Number(pricedOrder.service_charge ?? 0)
    if (!Number.isFinite(finalTotal) || finalTotal < 0) {
      await cleanupPendingOrder(orderId)
      return { success: false, error: "El total de la orden es inválido." }
    }
    const discountAmount = Number(
      (pricedOrder as { discount_amount?: number }).discount_amount ?? 0,
    )
    const allInLedger = amountsMatch(finalSubtotal, finalTotal)
    const transferredLedger = amountsMatch(finalSubtotal + finalFee, finalTotal)
    const discountedLedger =
      Number.isFinite(discountAmount) &&
      discountAmount > 0 &&
      finalTotal <= finalSubtotal + finalFee + 0.009
    if (!allInLedger && !transferredLedger && !discountedLedger) {
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
    if (
      checkoutPreferenceUndersellsQuote({
        databaseTotal: finalTotal,
        quotedCustomerTotal: quoted.quote.customerTotal,
        promoApplied: Boolean(cleanPromoId || resumedPromoCodeId),
      })
    ) {
      await cleanupPendingOrder(orderId)
      logger.error({
        context: "checkout/reservation",
        message: "preference_below_quoted_fee",
        orderId,
        eventId: payload.eventId,
        databaseTotal: finalTotal,
        quoted: quoted.quote.customerTotal,
      })
      return {
        success: false,
        error: "No se pudo congelar el total de la orden.",
      }
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
      let finalizeError = sandboxRpc.error
      let result = (sandboxRpc.data ?? {}) as { ok?: boolean; code?: string }

      if (
        shouldFallbackSandboxFinalize({
          errorMessage: finalizeError?.message,
          code: result.code,
        })
      ) {
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
        logger.error({
          context: "checkout/sandbox",
          message: "sandbox_finalize_failed",
          orderId,
          userId: user.id,
          error: finalizeError?.message ?? result.code ?? "unknown",
        })
      }

      try {
        await fulfillSandboxPaidOrder(orderId)
      } catch (error) {
        await cleanupPendingOrder(orderId)
        const finalizeMessage =
          error instanceof Error
            ? error.message
            : finalizeError?.message ?? result.code ?? "unknown"
        logger.error({
          context: "checkout/sandbox",
          message: "sandbox_fulfillment_follow_through_failed",
          orderId,
          error,
        })
        const mapped = mapReserveRpcError(finalizeMessage)
        return {
          success: false,
          error:
            mapped?.error ??
            sandboxOrFallback(
              useSandbox,
              formatCheckoutDbError(finalizeError) || finalizeMessage,
              "No se pudo completar la compra de prueba.",
            ),
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
      const session = await openCheckoutPaymentSession({
        provider: payload.paymentProvider,
        orderId,
        db,
        buyerId: user.id,
        eventId: payload.eventId,
        eventTitle: eventRow?.title,
        amount: finalTotal,
        buyer: {
          name: buyer.buyerName,
          email: buyer.buyerEmail,
          dni: buyer.buyerDni,
        },
        checkoutExpiresAt,
        cleanupPendingOrder,
      })
      if (!session.ok) {
        return { success: false, error: session.error }
      }
      initPoint = session.checkoutUrl
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
      return resolvePhaseRolloverAfterError(db, payload.eventId, cartItems)
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
      error: sandboxOrFallback(useSandbox, message, GENERIC_CHECKOUT_ERROR),
    }
  }
}

