import "server-only"

import { Preference } from "mercadopago"

import { logger } from "@/lib/logger"
import { getMercadoPagoClient } from "@/lib/mercadopago"
import { withCircuit } from "@/lib/resilience/circuit-breaker"
import {
  preferenceIdFromOrder,
  selectStalePreferenceOrders,
  type StalePreferenceOrder,
} from "@/lib/payments/stale-preference-select"
import { createAdminClient } from "@/lib/supabase/admin"

export {
  preferenceIdFromOrder,
  selectStalePreferenceOrders,
  type StalePreferenceOrder,
} from "@/lib/payments/stale-preference-select"

export async function expireMercadoPagoPreference(
  preferenceId: string,
): Promise<void> {
  const id = preferenceId.trim()
  if (!id) return
  const client = getMercadoPagoClient()
  const preference = new Preference(client)
  await withCircuit("mercadopago", () =>
    preference.update({
      id,
      updatePreferenceRequest: {
        expires: true,
        expiration_date_to: new Date(Date.now() - 1000).toISOString(),
      } as Parameters<Preference["update"]>[0]["updatePreferenceRequest"],
    }),
  )
}

export async function expireCheckoutPreferenceOnOrder(
  orderId: string,
): Promise<void> {
  const id = orderId.trim()
  if (!id) return

  const admin = createAdminClient()
  const { data: order, error } = await admin
    .from("orders")
    .select("id, mp_preference_id, provider_preference_id, payment_provider")
    .eq("id", id)
    .maybeSingle()

  if (error || !order) return

  const preferenceId = preferenceIdFromOrder(order)
  if (!preferenceId) return

  try {
    if (
      (order.payment_provider ?? "mercadopago") === "mercadopago" ||
      order.mp_preference_id
    ) {
      await expireMercadoPagoPreference(preferenceId)
    }
  } catch (expireError) {
    logger.error({
      context: "payments/stale-preferences",
      message: "current_preference_expire_failed",
      orderId: id,
      preferenceId,
      error: expireError,
    })
  }
}

/**
 * Cierra preferencias MP de ordenes pending/expired del mismo comprador y
 * evento, excepto la orden vigente. Best-effort: un fallo de MP no aborta
 * el checkout nuevo.
 */
export async function invalidateStaleCheckoutPreferences(input: {
  buyerId: string
  eventId: string
  exceptOrderId: string
}): Promise<void> {
  const admin = createAdminClient()
  const { data: ticketRows, error: ticketError } = await admin
    .from("tickets")
    .select("order_id")
    .eq("event_id", input.eventId)

  if (ticketError) {
    logger.error({
      context: "payments/stale-preferences",
      message: "tickets_lookup_failed",
      eventId: input.eventId,
      error: ticketError.message,
    })
    return
  }

  const orderIds = [
    ...new Set(
      (ticketRows ?? [])
        .map((row) => String(row.order_id ?? "").trim())
        .filter(Boolean),
    ),
  ]
  if (orderIds.length === 0) return

  const { data: orders, error: orderError } = await admin
    .from("orders")
    .select(
      "id, status, mp_preference_id, provider_preference_id, payment_provider, buyer_id",
    )
    .in("id", orderIds)
    .eq("buyer_id", input.buyerId)

  if (orderError) {
    logger.error({
      context: "payments/stale-preferences",
      message: "orders_lookup_failed",
      eventId: input.eventId,
      error: orderError.message,
    })
    return
  }

  const stale = selectStalePreferenceOrders(
    (orders ?? []) as StalePreferenceOrder[],
    input.exceptOrderId,
  )

  for (const order of stale) {
    const preferenceId = preferenceIdFromOrder(order)
    if (!preferenceId) continue
    try {
      if (
        (order.payment_provider ?? "mercadopago") === "mercadopago" ||
        order.mp_preference_id
      ) {
        await expireMercadoPagoPreference(preferenceId)
      }
    } catch (error) {
      logger.error({
        context: "payments/stale-preferences",
        message: "preference_expire_failed",
        orderId: order.id,
        preferenceId,
        error,
      })
    }

    const { error: clearError } = await admin
      .from("orders")
      .update({
        mp_preference_id: null,
        provider_preference_id: null,
      })
      .eq("id", order.id)
      .in("status", ["pending", "expired"])

    if (clearError) {
      logger.error({
        context: "payments/stale-preferences",
        message: "preference_clear_failed",
        orderId: order.id,
        error: clearError.message,
      })
    }
  }
}
