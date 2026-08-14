"use server"

import { revalidatePath } from "next/cache"

import { createPaymentPreference } from "@/app/actions/payments"
import { resolveCheckoutExpiresAt } from "@/lib/checkout-hold"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import {
  validateCheckoutBuyer,
  type CheckoutBuyerInfo,
  type NormalizedCheckoutBuyer,
} from "@/lib/checkout-buyer"
import { isPastEvent, isSoldOut } from "@/lib/event-status"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const EVENT_FINISHED_ERROR = "El evento ya ha finalizado"
const EVENT_SOLD_OUT_ERROR = "El evento o sector se encuentra agotado"

export type ReservedTicket = {
  ticket_id: string
}

export type CheckoutCartItem = {
  tierId: string
  quantity: number
  seatingUnitId?: string
  /** sector_key del mapa / seating_layout; la RPC cruza zone_tier_pricing. */
  sectorKey?: string | null
  tableNumber?: number | null
  zoneId?: string | null
}

export type CheckoutAddonItem = {
  itemId: string
  quantity: number
}

export type CheckoutResult =
  | {
      success: true
      tickets: ReservedTicket[]
      orderId: string
      initPoint: string
      /** ISO fin del hold (8m). Fuente de verdad UX del countdown. */
      expiresAt: string
      reservedUntil?: string
    }
  | {
      success: false
      error: "auth_required" | "out_of_stock" | string
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

  if (normalized.includes("seating_unit_unavailable")) {
    return { success: false, error: "out_of_stock" }
  }

  if (normalized.includes("agotad")) {
    return { success: false, error: EVENT_SOLD_OUT_ERROR }
  }

  if (
    normalized.includes("sold out") ||
    normalized.includes("stock") ||
    normalized.includes("capacity") ||
    normalized.includes("not published") ||
    normalized.includes("not found")
  ) {
    return { success: false, error: "out_of_stock" }
  }

  return null
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
    logger.error({
      context: "checkout/cleanup",
      message: "pending_order_cleanup_failed",
      orderId,
      error,
    })
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
): Promise<CheckoutResult> {
  return startCheckoutWithPayment(eventId, [{ tierId, quantity }])
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
): Promise<CheckoutResult> {
  const cleanEventId = eventId.trim()
  const cleanSeatId = seatId.trim()
  const cleanUserId = userId.trim()

  if (!cleanEventId || !cleanSeatId || !cleanUserId) {
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
    referralCode,
    [],
    buyer,
    promoCodeId,
  )

  if (!result.success && result.error === "out_of_stock") {
    return { success: false, error: SEATING_COLLISION_MESSAGE }
  }

  return result
}

export async function startCheckoutWithPayment(
  eventId: string,
  items: CheckoutCartItem[],
  referralCode?: string | null,
  addons: CheckoutAddonItem[] = [],
  buyerInfo?: CheckoutBuyerInfo | null,
  promoCodeId?: string | null,
  options?: { sandbox?: boolean },
): Promise<CheckoutResult> {
  if (!eventId || items.length === 0) {
    return { success: false, error: "Datos de compra incompletos." }
  }

  const buyerValidation = validateCheckoutBuyer(buyerInfo)
  if (!buyerValidation.ok) {
    return { success: false, error: buyerValidation.error }
  }
  const buyer = buyerValidation.buyer

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)

  if (
    !Number.isInteger(totalQuantity) ||
    totalQuantity < 1 ||
    totalQuantity > MAX_TICKETS_PER_PURCHASE
  ) {
    return {
      success: false,
      error: `Podés reservar entre 1 y ${MAX_TICKETS_PER_PURCHASE} entradas por compra.`,
    }
  }

  for (const item of items) {
    if (
      !item.tierId ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return { success: false, error: "Selección de entradas inválida." }
    }
  }

  const seatingItems = items.filter((item) => item.seatingUnitId)
  if (
    seatingItems.length > 1 ||
    (seatingItems.length === 1 &&
      (items.length !== 1 || seatingItems[0]?.quantity !== 1))
  ) {
    return {
      success: false,
      error: "Comprá una ubicación numerada por operación.",
    }
  }

  for (const addon of addons) {
    if (
      !addon.itemId ||
      !Number.isInteger(addon.quantity) ||
      addon.quantity < 1
    ) {
      return { success: false, error: "Selección de consumiciones inválida." }
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

  const [{ data: eventRow }, { data: eventTiers }] = await Promise.all([
    supabase
      .from("events")
      .select("date, ends_at, schedule_days")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("ticket_tiers")
      .select("capacity, sold, visibility")
      .eq("event_id", eventId),
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

  // Nunca confiar en promoter_id del cliente: solo resolver ?ref=CODE en servidor.
  let promoterId: string | null = null
  const cleanRef = referralCode?.trim()
  if (cleanRef) {
    const { data: resolved } = await supabase.rpc(
      "resolve_promoter_for_checkout",
      {
        p_referral_code: cleanRef,
        p_event_id: eventId,
      },
    )
    promoterId = resolved ?? null
  }

  const tierIds = [...new Set(items.map((item) => item.tierId))]
  const { data: tierMeta } = await supabase
    .from("ticket_tiers")
    .select("id, seating_sector_id")
    .eq("event_id", eventId)
    .in("id", tierIds)

  const sectorByTier = new Map(
    (tierMeta ?? []).map((row) => [row.id, row.seating_sector_id]),
  )

  const rpcItems = items.map((item) => ({
    tier_id: item.tierId,
    quantity: item.quantity,
    sector_key: item.sectorKey ?? sectorByTier.get(item.tierId) ?? null,
    table_number: item.tableNumber ?? null,
    zone_id: item.zoneId ?? null,
  }))

  let pendingOrderId: string | null = null

  try {
    // Libera holds pending abandonados del comprador (si la migración P22 está aplicada).
    try {
      await supabase.rpc("expire_buyer_pending_event_orders", {
        p_owner_id: user.id,
        p_event_id: eventId,
      })
    } catch {
      // RPC ausente en entornos sin P22 todavía — reserve_tickets_tx cubre el caso.
    }

    const seatingItem = seatingItems[0]
    const reservation = seatingItem?.seatingUnitId
      ? await supabase.rpc("reserve_seating_unit_tx", {
          p_event_id: eventId,
          p_owner_id: user.id,
          p_tier_id: seatingItem.tierId,
          p_seating_unit_id: seatingItem.seatingUnitId,
          p_promoter_id: promoterId,
        })
      : await supabase.rpc("reserve_tickets_tx", {
          p_event_id: eventId,
          p_owner_id: user.id,
          p_items: rpcItems,
          p_promoter_id: promoterId,
        })
    const { data, error } = reservation

    if (error) {
      const mapped = mapReserveRpcError(error.message)
      if (mapped) return mapped

      logger.error({
        context: "checkout/reservation",
        message: "reservation_rpc_failed",
        eventId,
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
    const reservedTickets: ReservedTicket[] = rows.map((row) => ({
      ticket_id: row.ticket_id,
    }))

    const holderApplied = await applyHolderIdentityToOrder({
      orderId,
      buyer,
    })
    if (!holderApplied.ok) {
      await cleanupPendingOrder(orderId)
      return { success: false, error: holderApplied.error }
    }

    if (addons.length > 0) {
      const { error: addonsError } = await supabase.rpc(
        "attach_event_items_to_order",
        {
          p_order_id: orderId,
          p_owner_id: user.id,
          p_items: addons.map((addon) => ({
            item_id: addon.itemId,
            quantity: addon.quantity,
          })),
        },
      )

      if (addonsError) {
        await cleanupPendingOrder(orderId)

        if (mapReserveRpcError(addonsError.message)) {
          return { success: false, error: "out_of_stock" }
        }

        return {
          success: false,
          error: addonsError.message || "No se pudieron reservar las consumiciones.",
        }
      }
    }

    const cleanPromoId = promoCodeId?.trim() || null
    if (cleanPromoId) {
      const { data: promoRows, error: promoError } = await supabase.rpc(
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
        return {
          success: false,
          error:
            promoResult?.message ||
            promoError?.message ||
            "No se pudo aplicar el cupón.",
        }
      }
    }

    const { data: pricedOrder, error: pricedOrderError } = await supabase
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
    const useSandbox = Boolean(options?.sandbox)

    if (useSandbox) {
      const allowed = await assertSandboxCheckoutAllowed(eventId, user.id)
      if (!allowed.ok) {
        await cleanupPendingOrder(orderId)
        return { success: false, error: allowed.error }
      }

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
        logger.error({
          context: "checkout/sandbox",
          message: "sandbox_finalize_failed",
          orderId,
          userId: user.id,
          error: finalizeError?.message ?? result.code ?? "unknown",
        })
        return {
          success: false,
          error: "No se pudo completar la compra de prueba.",
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
      const preference = await createPaymentPreference(orderId)

      if (!preference.success) {
        await cleanupPendingOrder(orderId)
        return {
          success: false,
          error:
            preference.error ||
            "Mercado Pago no respondió. Intentá de nuevo en unos minutos.",
        }
      }

      initPoint = preference.initPoint
    }

    pendingOrderId = null
    revalidatePath(`/events/${eventId}`)
    revalidatePath("/events")
    revalidatePath("/cuenta/entradas")
    revalidatePath("/admin")
    revalidatePath("/admin/promoters")
    revalidatePath("/promoter/dashboard")
    revalidatePath("/superadmin")
    revalidatePath("/super-admin")

    const reservedUntil = rows[0]?.reserved_until
    const expiresAt = resolveCheckoutExpiresAt(reservedUntil).toISOString()

    return {
      success: true,
      tickets: reservedTickets,
      orderId,
      initPoint,
      expiresAt,
      ...(reservedUntil ? { reservedUntil } : {}),
    }
  } catch (error) {
    if (pendingOrderId) {
      await cleanupPendingOrder(pendingOrderId)
    }

    logger.error({
      context: "checkout/start",
      message: "unexpected_checkout_error",
      eventId,
      userId: user.id,
      orderId: pendingOrderId,
      error,
    })
    return {
      success: false,
      error: "Error inesperado durante el checkout. Intentá nuevamente.",
    }
  }
}

async function assertSandboxCheckoutAllowed(
  eventId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const [{ data: event }, { data: profile }] = await Promise.all([
    supabase
      .from("events")
      .select("id, organizer_id, status")
      .eq("id", eventId)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ])

  if (!event) {
    return { ok: false, error: "Evento no encontrado." }
  }

  const role = profile?.role
  const isStaff =
    event.organizer_id === userId || role === "super_admin"

  if (!isStaff) {
    return {
      ok: false,
      error: "La compra de prueba solo está disponible para el organizador.",
    }
  }

  if (
    event.status !== "published" &&
    event.status !== "draft" &&
    event.status !== "paused"
  ) {
    return {
      ok: false,
      error: "Este evento no admite compras de prueba en su estado actual.",
    }
  }

  return { ok: true }
}

/** ¿El usuario autenticado puede ver el botón Sandbox en este evento? */
export async function canUserSandboxCheckout(
  eventId: string,
): Promise<boolean> {
  if (!eventId) return false
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const allowed = await assertSandboxCheckoutAllowed(eventId, user.id)
  return allowed.ok
}

/**
 * Compra de prueba (Modo Sandbox): misma reserva atómica, sin Mercado Pago.
 */
export async function startSandboxCheckout(
  eventId: string,
  items: CheckoutCartItem[],
  referralCode?: string | null,
  addons: CheckoutAddonItem[] = [],
  buyerInfo?: CheckoutBuyerInfo | null,
  promoCodeId?: string | null,
): Promise<CheckoutResult> {
  return startCheckoutWithPayment(
    eventId,
    items,
    referralCode,
    addons,
    buyerInfo,
    promoCodeId,
    { sandbox: true },
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
 * Internamente: reserva atómica → `createPaymentPreference(orderId)` → initPoint.
 * No confía en `unitPrice` del cliente.
 */
export async function createCheckoutPreference(
  input: CreateCheckoutPreferenceInput,
): Promise<CheckoutResult> {
  const eventId = input.eventId?.trim()
  const ticketTypeId = input.ticketTypeId?.trim()
  const quantity = input.quantity

  if (!eventId || !ticketTypeId) {
    return { success: false, error: "Datos de compra incompletos." }
  }

  return startCheckoutWithPayment(
    eventId,
    [{ tierId: ticketTypeId, quantity }],
    input.referralCode,
    [],
    {
      buyerName: input.buyerName ?? "",
      buyerDni: input.buyerDni ?? "",
      buyerEmail: input.buyerEmail ?? "",
      buyerPhone: "",
    },
  )
}
