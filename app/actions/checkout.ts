"use server"

import { revalidatePath } from "next/cache"

import { createPaymentPreference } from "@/app/actions/payments"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type ReservedTicket = {
  ticket_id: string
}

export type CheckoutCartItem = {
  tierId: string
  quantity: number
  seatingUnitId?: string
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

function isStockError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("sold out") ||
    normalized.includes("stock") ||
    normalized.includes("agotad") ||
    normalized.includes("capacity") ||
    normalized.includes("not published") ||
    normalized.includes("not found") ||
    normalized.includes("max_tickets_per_user")
    || normalized.includes("seating_unit_unavailable")
  )
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

  const { data: availableUnits, error: unitError } = await supabase.rpc(
    "get_event_seating_availability",
    { p_event_id: cleanEventId },
  )
  const unit = availableUnits?.find(
    (candidate) => candidate.id === cleanSeatId,
  )

  if (unitError || !unit || unit.status !== "available") {
    return { success: false, error: SEATING_COLLISION_MESSAGE }
  }

  const result = await startCheckoutWithPayment(
    cleanEventId,
    [{ tierId: unit.tier_id, quantity: 1, seatingUnitId: unit.id }],
    referralCode,
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
): Promise<CheckoutResult> {
  if (!eventId || items.length === 0) {
    return { success: false, error: "Datos de compra incompletos." }
  }

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

  const rpcItems = items.map((item) => ({
    tier_id: item.tierId,
    quantity: item.quantity,
  }))

  let pendingOrderId: string | null = null

  try {
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
      if (isStockError(error.message)) {
        if (
          error.message.toUpperCase().includes("MAX_TICKETS_PER_USER_EXCEEDED")
        ) {
          return {
            success: false,
            error:
              "Alcanzaste el máximo de entradas por persona para este evento.",
          }
        }
        return { success: false, error: "out_of_stock" }
      }

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

        if (isStockError(addonsError.message)) {
          return { success: false, error: "out_of_stock" }
        }

        return {
          success: false,
          error: addonsError.message || "No se pudieron reservar las consumiciones.",
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
    if (finalTotal === 0) {
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
    revalidatePath("/my-tickets")
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
      ...(rows[0]?.reserved_until
        ? { reservedUntil: rows[0].reserved_until }
        : {}),
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
