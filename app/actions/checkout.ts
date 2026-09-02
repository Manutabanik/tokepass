"use server"


import {
  type CheckoutBuyerInfo,
} from "@/lib/checkout-buyer"
import { normalizeCheckoutHoldSessionId } from "@/lib/checkout/hold-session"
import { logger } from "@/lib/logger"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"
import {
  checkoutActionFailure,
} from "@/lib/checkout/checkout-feedback"
import {
  ERR_NO_STOCK,
  ERR_SEAT_TAKEN,
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
  pickSeatingUnitRowForRequestedDay,
  requireHoldEventDateId,
  seatingUnitMatchesEventDate,
} from "@/lib/checkout/seat-hold-day"
import {
  assertCartHasAdmissionSku,
  assertLoadedCheckoutTiersCoverCart,
} from "@/lib/checkout/sellable-tickets"
import { resolveTicketCommerceType } from "@/lib/events/ticket-commerce-type"
import {
  generalRemainingWithOwnHolds,
  generalTierRemaining,
  ownActiveGaHoldQuantity,
  partitionMixedCartItems,
  tierIsNumbered,
} from "@/lib/checkout/mixed-cart"
import {
  reserveRpcErrorText,
} from "@/lib/checkout/lock-timeout"
import {
  CHECKOUT_VERIFY_ERROR,
  verifyCheckoutCaptcha,
} from "@/lib/checkout/bot-guard"
import { getCheckoutRequestContext } from "@/lib/checkout/request-context"
import { captureCriticalException } from "@/lib/sentry/capture"
import {
  CART_HOLD_RATE_LIMIT_ERROR,
  cartHoldRateLimited,
} from "@/lib/checkout/server-guards"
import { normalizePreviewKey } from "@/lib/preview/sandbox"
import {
  tryCreateAdminClient,
} from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  checkoutItemElementId,
  checkoutItemSeatId,
  checkoutItemTierId,
  toReserveRpcItem,
} from "@/lib/checkout/hybrid-cart"
import { sortCheckoutItemsForLocks, sortReserveRpcItems } from "@/lib/checkout/lock-order"
import { toCheckoutUserError } from "@/lib/errors/commerce-errors"
import {
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
import type {
  CartHoldListRow,
  CartSeatingHoldResult,
  CheckoutResult,
  CheckoutSupabase,
  CreateCheckoutPreferenceInput,
  HoldOwner,
  LockTicketsItem,
  LockTicketsResult,
} from "@/lib/modules/checkout/types/checkout.types"

import {
  evaluateCartSaleWindows,
  loadCheckoutTierCommerce,
  loadEventScheduleDayIds,
  loadEventSeatingSectorIds,
  loadLayoutHoldUnits,
  resolveMappedSeatingUnits,
} from "@/lib/modules/checkout/services/inventory.service"
import { GENERIC_CHECKOUT_ERROR } from "@/lib/modules/checkout/constants/checkout-errors"
import { mapReserveRpcError } from "@/lib/modules/checkout/errors/map-reserve-error"
import {
  assertCheckoutWaitingRoom,
  resolveCheckoutEventAccess,
  transferGuestHoldsToBuyer,
} from "@/lib/modules/checkout/services/access.service"
import { startCheckoutWithPayment as startCheckoutWithPaymentService } from "@/lib/modules/checkout/services/checkout.service"

/**
 * Fachada del flujo completo de checkout. La orquestación vive en
 * `checkout.service.ts`; acá solo se expone como Server Action.
 */
export async function startCheckoutWithPayment(
  ...args: Parameters<typeof startCheckoutWithPaymentService>
): Promise<CheckoutResult> {
  // Red de contención de la frontera: el prólogo del servicio (validación,
  // acceso, cotización) corre fuera de su propio try, así que una excepción
  // ahí llegaría al cliente como un fallo de Server Action en vez de un
  // CheckoutResult. El `await` es necesario para atrapar rechazos async.
  try {
    return await startCheckoutWithPaymentService(...args)
  } catch (error) {
    captureCriticalException(error, "checkout/action-boundary")
    logger.error({
      context: "checkout/action-boundary",
      message: "unhandled_checkout_exception",
      error,
    })
    return { success: false, error: GENERIC_CHECKOUT_ERROR }
  }
}

async function resolveHoldOwner(
  sessionId?: string | null,
): Promise<HoldOwner> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    return { ok: true, ownerId: user.id, userId: user.id, useAdmin: false }
  }
  const session = normalizeCheckoutHoldSessionId(sessionId)
  if (!session) {
    return { ok: false, error: "auth_required" }
  }
  return { ok: true, ownerId: session, userId: null, useAdmin: true }
}

function holdDatabase(
  accessDb: CheckoutSupabase,
  useAdmin: boolean,
): CheckoutSupabase | null {
  if (!useAdmin) return accessDb
  return (tryCreateAdminClient() as CheckoutSupabase | null) ?? null
}

async function adoptGuestHoldsForUser(input: {
  eventId?: string | null
  sessionId?: string | null
  userId: string
}) {
  if (!input.eventId) return { ok: true as const }
  return transferGuestHoldsToBuyer({
    eventId: input.eventId,
    sessionId: input.sessionId,
    buyerId: input.userId,
  })
}

export async function holdSeatingUnitForCart(
  eventId: string,
  seatingUnitId: string,
  previewKey?: string | null,
  sessionId?: string | null,
): Promise<CartSeatingHoldResult> {
  const parsed = CheckoutSeatHoldSchema.safeParse({ eventId, seatingUnitId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId
  seatingUnitId = parsed.data.seatingUnitId

  const owner = await resolveHoldOwner(sessionId)
  if (!owner.ok) {
    return { success: false, error: owner.error }
  }
  if (owner.userId) {
    const adopted = await adoptGuestHoldsForUser({
      eventId,
      sessionId,
      userId: owner.userId,
    })
    if (!adopted.ok) {
      return { success: false, error: adopted.error }
    }
  }

  const access = await resolveCheckoutEventAccess({
    eventId,
    userId: owner.userId ?? owner.ownerId,
    previewKey,
  })
  if (!access.ok) {
    return { success: false, error: access.error }
  }
  const db = holdDatabase(access.db, owner.useAdmin)
  if (!db) {
    return { success: false, error: "No se pudo abrir la reserva temporal. Probá de nuevo." }
  }

  const room = await assertCheckoutWaitingRoom({
    eventId: access.eventId,
    eventSlug: access.eventSlug,
    bypass: access.useSandbox || Boolean(previewKey),
  })
  if (!room.ok) {
    return { success: false, error: room.error }
  }

  const allowed = !(await cartHoldRateLimited(owner.ownerId))
  if (!allowed) {
    return {
      success: false,
      error: CART_HOLD_RATE_LIMIT_ERROR,
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
    p_owner_id: owner.ownerId,
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

export async function releaseSeatHolds(
  eventId?: string | null,
  sessionId?: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const owner = await resolveHoldOwner(sessionId)
  if (!owner.ok) {
    return { success: false, error: owner.error }
  }
  const supabase = owner.useAdmin
    ? tryCreateAdminClient()
    : await createClient()
  if (!supabase) {
    return {
      success: false,
      error: "No se pudo abrir la reserva temporal. Probá de nuevo.",
    }
  }

  const { error } = await supabase.rpc("release_seat_holds", {
    p_session_id: owner.ownerId,
    p_event_id: eventId?.trim() || null,
  })
  if (error) {
    if (/could not find|schema cache|does not exist|pgrst202/i.test(error.message)) {
      return { success: true }
    }
    logger.error({
      context: "checkout/seat-hold",
      message: "release_seat_holds_failed",
      eventId,
      error: error.message,
    })
    return {
      success: false,
      error: toCheckoutUserError(error, "No se pudo liberar la reserva."),
    }
  }
  return { success: true }
}

export async function holdSeatingUnitForCartByLayoutItem(
  eventId: string,
  sectorId: string,
  layoutItemId: string,
  previewKey?: string | null,
  eventDateId?: string | null,
  sessionId?: string | null,
  comboTierId?: string | null,
): Promise<
  CartSeatingHoldResult & {
    seatingUnitId?: string
    seatingUnitIds?: string[]
    eventDateId?: string
  }
> {
  const parsed = CheckoutLayoutHoldSchema.safeParse({
    eventId,
    sectorId,
    layoutItemId,
    eventDateId,
    dateId: eventDateId,
    comboTierId: comboTierId || undefined,
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

  const owner = await resolveHoldOwner(sessionId)
  if (!owner.ok) {
    return { success: false, error: owner.error }
  }
  if (owner.userId) {
    const adopted = await adoptGuestHoldsForUser({
      eventId,
      sessionId,
      userId: owner.userId,
    })
    if (!adopted.ok) {
      return { success: false, error: adopted.error }
    }
  }

  const access = await resolveCheckoutEventAccess({
    eventId,
    userId: owner.userId ?? owner.ownerId,
    previewKey,
  })
  if (!access.ok) {
    return { success: false, error: access.error }
  }
  const db = holdDatabase(access.db, owner.useAdmin)
  if (!db) {
    return { success: false, error: "No se pudo abrir la reserva temporal. Probá de nuevo." }
  }
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

  const room = await assertCheckoutWaitingRoom({
    eventId: access.eventId,
    eventSlug: access.eventSlug,
    bypass: access.useSandbox || Boolean(previewKey),
  })
  if (!room.ok) {
    return { success: false, error: room.error }
  }

  const allowed = !(await cartHoldRateLimited(owner.ownerId))
  if (!allowed) {
    return {
      success: false,
      error: CART_HOLD_RATE_LIMIT_ERROR,
    }
  }

  if (parsed.data.comboTierId) {
    const combo = await db.rpc("hold_layout_item_for_combo", {
      p_event_id: eventId,
      p_owner_id: owner.ownerId,
      p_sector_id: sectorId,
      p_layout_item_id: layoutItemId,
      p_combo_tier_id: parsed.data.comboTierId,
    })
    if (!combo.error) {
      const rows = Array.isArray(combo.data)
        ? combo.data
        : combo.data
          ? [combo.data]
          : []
      const preferred = pickSeatingUnitRowForRequestedDay(
        rows,
        eventDateId,
        scheduleDayIds.length,
      )
      if (!preferred?.reserved_until || !preferred?.seating_unit_id) {
        return { success: false, error: "out_of_stock" }
      }
      return {
        success: true,
        reservedUntil: preferred.reserved_until,
        seatingUnitId: preferred.seating_unit_id,
        eventDateId: preferred.event_date_id ?? undefined,
        seatingUnitIds: rows
          .map((row) => row.seating_unit_id)
          .filter((id): id is string => Boolean(id)),
      }
    }
    if (!/could not find|schema cache|does not exist|pgrst202/i.test(combo.error.message)) {
      const mapped = mapReserveRpcError(reserveRpcErrorText(combo.error))
      if (mapped) return { success: false, error: mapped.error }
      logger.error({
        context: "checkout/cart-hold",
        message: "hold_layout_item_for_combo_failed",
        eventId,
        sectorId,
        layoutItemId,
        comboTierId: parsed.data.comboTierId,
        error: combo.error.message,
      })
      return {
        success: false,
        error: "No se pudo reservar esa ubicación. Elegí otra.",
      }
    }
  }

  const unitRows = await loadLayoutHoldUnits(db, {
    eventId,
    layoutItemId,
    eventDateId,
    scheduleDayCount: scheduleDayIds.length,
  })
  const matchedUnit = pickSeatingUnitForLayoutHold(
    unitRows,
    sectorId,
    eventDateId,
    { scheduleDayCount: scheduleDayIds.length },
  )
  if (
    eventDateId &&
    unitRows.length > 0 &&
    !unitRows.some((row) =>
      seatingUnitMatchesEventDate(row, eventDateId, {
        scheduleDayCount: scheduleDayIds.length,
      }),
    )
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
      p_owner_id: owner.ownerId,
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
      p_owner_id: owner.ownerId,
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
  sessionId?: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = CheckoutSeatHoldSchema.safeParse({ eventId, seatingUnitId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId
  seatingUnitId = parsed.data.seatingUnitId

  const owner = await resolveHoldOwner(sessionId)
  if (!owner.ok) {
    return { success: false, error: owner.error }
  }
  const supabase = owner.useAdmin
    ? tryCreateAdminClient()
    : await createClient()
  if (!supabase) {
    return {
      success: false,
      error: "No se pudo abrir la reserva temporal. Probá de nuevo.",
    }
  }

  const { error } = await supabase.rpc("release_seating_unit_cart_hold", {
    p_event_id: eventId,
    p_owner_id: owner.ownerId,
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

export async function lockTickets(
  eventId: string,
  items: LockTicketsItem[],
  previewKey?: string | null,
  sessionId?: string | null,
): Promise<LockTicketsResult> {
  const parsed = CheckoutLockTicketsSchema.safeParse({ eventId, items })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId

  try {
    return await executeLockTickets(
      eventId,
      parsed.data.items,
      previewKey,
      sessionId,
    )
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
  sessionId?: string | null,
): Promise<LockTicketsResult> {
  const owner = await resolveHoldOwner(sessionId)
  if (!owner.ok) {
    return { success: false, error: owner.error }
  }
  if (owner.userId) {
    const adopted = await adoptGuestHoldsForUser({
      eventId,
      sessionId,
      userId: owner.userId,
    })
    if (!adopted.ok) {
      return { success: false, error: adopted.error }
    }
  }

  const access = await resolveCheckoutEventAccess({
    eventId,
    userId: owner.userId ?? owner.ownerId,
    previewKey,
  })
  if (!access.ok) {
    return { success: false, error: access.error }
  }
  const holdDb = holdDatabase(access.db, owner.useAdmin)
  if (!holdDb) {
    return {
      success: false,
      error: "No se pudo abrir la reserva temporal. Probá de nuevo.",
    }
  }
  access.db = holdDb

  const room = await assertCheckoutWaitingRoom({
    eventId: access.eventId,
    eventSlug: access.eventSlug,
    bypass: access.useSandbox || Boolean(previewKey),
  })
  if (!room.ok) {
    return { success: false, error: room.error }
  }

  const allowed = !(await cartHoldRateLimited(owner.ownerId))
  if (!allowed) {
    return {
      success: false,
      error: CART_HOLD_RATE_LIMIT_ERROR,
    }
  }

  const resolvedCart = await resolveMappedSeatingUnits(
    access.db,
    eventId,
    cartItemsInput,
  )
  if (!resolvedCart.ok) {
    return { success: false, error: resolvedCart.error }
  }
  const cartItems = resolvedCart.items
  const allTierIds = [
    ...new Set(cartItems.map((item) => checkoutItemTierId(item))),
  ]

  const [eventRes, tiersRes, stockRes] = await Promise.all([
    access.db
      .from("events")
      .select("max_tickets_per_user, has_seating_plan")
      .eq("id", eventId)
      .maybeSingle(),
    loadCheckoutTierCommerce(access.db, eventId, allTierIds),
    access.db.rpc("get_event_tier_live_stock", { p_event_id: eventId }),
  ])
  if (!tiersRes.ok) {
    return { success: false, error: tiersRes.error }
  }
  const holdTiers = tiersRes.rows
  const holdEvent = eventRes.data
  const covered = assertLoadedCheckoutTiersCoverCart(allTierIds, holdTiers)
  if (!covered.ok) {
    return { success: false, error: covered.error }
  }
  const extrasGate = assertCartHasAdmissionSku(cartItems.length, holdTiers)
  if (!extrasGate.ok) {
    return { success: false, error: extrasGate.error }
  }
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

  const eventHasSeatingPlan = holdEvent?.has_seating_plan !== false
  const { mapItems, generalItems } = partitionMixedCartItems({
    items: cartItems,
    tiers: (holdTiers ?? []).map((tier) => ({
      id: tier.id,
      name: tier.name,
      layoutType: eventHasSeatingPlan ? tier.layout_type : "general",
      seatingSectorId: eventHasSeatingPlan ? tier.seating_sector_id : null,
      hasMap:
        eventHasSeatingPlan && Boolean(tier.seating_sector_id?.trim()),
      isNumbered:
        eventHasSeatingPlan && layoutRequiresSeatSelection(tier.layout_type),
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
        layoutType: eventHasSeatingPlan ? tier?.layout_type : "general",
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
  const { data: ownGaHolds } = await access.db
    .from("event_ga_cart_holds")
    .select("tier_id, quantity, reserved_until")
    .eq("event_id", eventId)
    .eq("owner_id", owner.ownerId)
  const nowMs = Date.now()
  const nameByTier = new Map(
    (holdTiers ?? []).map((tier) => [tier.id, tier.name?.trim() || ""]),
  )
  for (const item of zoneGeneralItems) {
    const tierId = checkoutItemTierId(item)
    const remaining = generalRemainingWithOwnHolds(
      remainingByTier.get(tierId),
      ownActiveGaHoldQuantity(ownGaHolds ?? [], tierId, nowMs),
    )
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
      name: tier.name ?? "",
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

  const rpcItems = sortReserveRpcItems(
    cartItems.map((item) => {
      const tier = (holdTiers ?? []).find(
        (row) => row.id === checkoutItemTierId(item),
      )
      return toReserveRpcItem(item, {
        isNumbered:
          eventHasSeatingPlan && layoutRequiresSeatSelection(tier?.layout_type),
        hasMap:
          eventHasSeatingPlan && Boolean(tier?.seating_sector_id?.trim()),
      })
    }),
  )
  const mixed = await access.db.rpc("hold_mixed_cart_for_checkout", {
    p_event_id: eventId,
    p_owner_id: owner.ownerId,
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
      const gaPayload = sortReserveRpcItems(
        zoneGeneralItems.map((item) => ({
          type: "general" as const,
          ticket_tier_id: checkoutItemTierId(item),
          tier_id: checkoutItemTierId(item),
          quantity: item.quantity,
        })),
      )
      if (gaPayload.length > 0) {
        const ga = await access.db.rpc("hold_ga_tickets_for_cart", {
          p_event_id: eventId,
          p_owner_id: owner.ownerId,
          p_items: gaPayload,
        })
        data = ga.data
        error = ga.error
        gaHeld = !ga.error
      }
    }
    if (!error) {
      for (const item of sortCheckoutItemsForLocks(numberedMapItems)) {
        const seatId = checkoutItemSeatId(item)
        if (!seatId) {
          if (gaHeld) {
            await access.db.rpc("release_ga_cart_holds", {
              p_event_id: eventId,
              p_owner_id: owner.ownerId,
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
          p_owner_id: owner.ownerId,
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
          p_owner_id: owner.ownerId,
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
          p_owner_id: owner.ownerId,
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
  sessionId?: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = CheckoutEventIdSchema.safeParse({ eventId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId

  const owner = await resolveHoldOwner(sessionId)
  if (!owner.ok) {
    return { success: false, error: owner.error }
  }
  const supabase = owner.useAdmin
    ? tryCreateAdminClient()
    : await createClient()
  if (!supabase) {
    return {
      success: false,
      error: "No se pudo abrir la reserva temporal. Probá de nuevo.",
    }
  }

  const { error } = await supabase.rpc("release_ga_cart_holds", {
    p_event_id: eventId,
    p_owner_id: owner.ownerId,
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

export async function listCartHolds(
  eventId: string,
  sessionId?: string | null,
): Promise<
  | { success: true; holds: CartHoldListRow[] }
  | { success: false; error: "auth_required" | string }
> {
  const parsed = CheckoutEventIdSchema.safeParse({ eventId })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }
  eventId = parsed.data.eventId

  const owner = await resolveHoldOwner(sessionId)
  if (!owner.ok) {
    return { success: false, error: owner.error }
  }
  const supabase = owner.useAdmin
    ? tryCreateAdminClient()
    : await createClient()
  if (!supabase) {
    return {
      success: false,
      error: "No se pudo abrir la reserva temporal. Probá de nuevo.",
    }
  }

  const { data, error } = await supabase.rpc("list_cart_holds", {
    p_event_id: eventId,
    p_owner_id: owner.ownerId,
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

const SEATING_COLLISION_MESSAGE =
  "Esta ubicación acaba de ser reservada por otra persona. Por favor elegí otra."

/**
 * Boundary for the numbered-seating checkout. Identity and tier ownership are
 * re-read on the server; the database RPC takes a row lock and conditionally
 * moves the unit from available to reserved for fifteen minutes.
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
  const unitDateId =
    "event_date_id" in unit ? (unit.event_date_id ?? null) : null
  const result = await startCheckoutWithPayment(
    cleanEventId,
    [
      {
        tierId: unit.tier_id,
        quantity: 1,
        seatingUnitId: unit.id,
        sectorKey: unit.sector_id,
        tableNumber: tableMatch ? Number(tableMatch[1]) : null,
        eventDateId: unitDateId,
        event_date_id: unitDateId,
        dateId: unitDateId,
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
  let bundleQuery = await supabase
    .from("ticket_tiers")
    .select(
      "id, event_id, tier_type, category, ticket_type, capacity, sold, bundle_items",
    )
    .eq("id", bundleTierId)
    .eq("event_id", eventId)
    .maybeSingle()
  if (
    bundleQuery.error &&
    /ticket_type|schema cache|PGRST204|42703/i.test(bundleQuery.error.message)
  ) {
    bundleQuery = await supabase
      .from("ticket_tiers")
      .select("id, event_id, tier_type, category, capacity, sold, bundle_items")
      .eq("id", bundleTierId)
      .eq("event_id", eventId)
      .maybeSingle()
  }

  const bundle = bundleQuery.data
  if (!bundle) {
    return { success: false, error: "Combo no encontrado." }
  }

  const isBundle = resolveTicketCommerceType(bundle) === "combo"
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
    subtotal: guard?.subtotal,
    serviceFee: guard?.serviceFee,
    grandTotal: guard?.grandTotal,
    ticketPrice: guard?.ticketPrice,
    feeAmount: guard?.feeAmount,
    customerTotal: guard?.customerTotal,
    lineQuotes: guard?.lineQuotes,
    idempotencyKey: guard?.idempotencyKey,
    cartSessionId: guard?.cartSessionId,
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
      subtotal: parsed.data.subtotal ?? guard?.subtotal,
      serviceFee: parsed.data.serviceFee ?? guard?.serviceFee,
      grandTotal: parsed.data.grandTotal ?? guard?.grandTotal,
      ticketPrice: parsed.data.ticketPrice ?? guard?.ticketPrice,
      feeAmount: parsed.data.feeAmount ?? guard?.feeAmount,
      customerTotal: parsed.data.customerTotal ?? guard?.customerTotal,
      lineQuotes: parsed.data.lineQuotes ?? guard?.lineQuotes,
      idempotencyKey: parsed.data.idempotencyKey ?? guard?.idempotencyKey,
      cartSessionId: parsed.data.cartSessionId ?? guard?.cartSessionId,
    },
  )
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
