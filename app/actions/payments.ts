"use server"

import { Preference } from "mercadopago"

import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMercadoPagoClient, getSiteUrl } from "@/lib/mercadopago"
import { createClient } from "@/lib/supabase/server"

export type CreatePreferenceResult =
  | { success: true; initPoint: string; preferenceId: string }
  | { success: false; error: string }

type OrderTicketRow = {
  id: string
  events: {
    id: string
    title: string
  } | null
  seating_unit: {
    reserved_until: string | null
  } | null
}

/**
 * Preferencia MP con monto All-In congelado (`orders.total_amount`).
 * Nunca relee precios mutables de ticket_tiers / event_items.
 * `service_charge` queda solo como ledger interno (no se factura aparte).
 */
export async function createPaymentPreference(
  orderId: string,
): Promise<CreatePreferenceResult> {
  if (!orderId) {
    return { success: false, error: "Orden inválida." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "Debés iniciar sesión para pagar." }
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, buyer_id, total_amount, subtotal, service_charge, status, mp_preference_id",
    )
    .eq("id", orderId)
    .maybeSingle()

  if (orderError || !order) {
    return { success: false, error: "No se encontró la orden." }
  }

  if (order.buyer_id !== user.id) {
    return { success: false, error: "No podés pagar una orden ajena." }
  }

  if (order.status !== "pending") {
    return {
      success: false,
      error: "Esta orden ya no admite un nuevo checkout.",
    }
  }

  const { data: tickets, error: ticketsError } = await supabase
    .from("tickets")
    .select(
      "id, events(id, title), seating_unit:event_seating_units(reserved_until)",
    )
    .eq("order_id", orderId)

  if (ticketsError) {
    logger.error({
      context: "payments/preference",
      message: "order_tickets_load_failed",
      orderId,
      userId: user.id,
      error: ticketsError.message,
    })
    return {
      success: false,
      error: "No se pudieron cargar las entradas de la orden.",
    }
  }

  const rows = (tickets ?? []) as unknown as OrderTicketRow[]

  if (rows.length === 0) {
    return {
      success: false,
      error: "La orden no tiene tickets asociados.",
    }
  }

  const frozenSubtotal = Number(order.subtotal)
  const frozenServiceCharge = Number(order.service_charge ?? 0)
  const frozenTotal = Number(order.total_amount)

  if (
    !Number.isFinite(frozenSubtotal) ||
    !Number.isFinite(frozenTotal) ||
    frozenTotal < 0 ||
    frozenSubtotal < 0
  ) {
    return { success: false, error: "Montos de orden inválidos." }
  }

  const isAllIn = Math.abs(frozenSubtotal - frozenTotal) <= 0.05
  const isLegacyMarkup =
    Math.abs(frozenSubtotal + frozenServiceCharge - frozenTotal) <= 0.05

  if (!isAllIn && !isLegacyMarkup) {
    return {
      success: false,
      error: "Inconsistencia en montos congelados de la orden.",
    }
  }

  if (frozenServiceCharge > frozenTotal + 0.05) {
    return {
      success: false,
      error: "Comisión interna inconsistente con el total cobrado.",
    }
  }

  const eventTitle = rows[0]?.events?.title ?? "Evento Tokepass"
  const seatingExpirations = rows
    .map((row) => row.seating_unit?.reserved_until)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
  const checkoutExpiresAt =
    seatingExpirations.length > 0 ? Math.min(...seatingExpirations) : null

  if (checkoutExpiresAt !== null && checkoutExpiresAt <= Date.now()) {
    return {
      success: false,
      error: "La reserva de ubicación venció. Elegí tu ubicación nuevamente.",
    }
  }

  const preferenceItems: Array<{
    id: string
    title: string
    quantity: number
    unit_price: number
    currency_id: "ARS"
  }> = [
    {
      id: `order-${orderId}-all-in`,
      title: `${eventTitle} — entradas y consumiciones`.slice(0, 256),
      quantity: 1,
      unit_price: frozenTotal,
      currency_id: "ARS",
    },
  ]

  const siteUrl = getSiteUrl()
  const notificationUrl = `${siteUrl}/api/webhooks/mercadopago`

  try {
    const client = getMercadoPagoClient()
    const preference = new Preference(client)

    const created = await preference.create({
      body: {
        items: preferenceItems,
        external_reference: orderId,
        statement_descriptor: "TOKEPASS",
        back_urls: {
          success: `${siteUrl}/checkout/success?order_id=${orderId}`,
          failure: `${siteUrl}/checkout/failure?order_id=${orderId}`,
          pending: `${siteUrl}/checkout/pending?order_id=${orderId}`,
        },
        auto_return: "approved",
        notification_url: notificationUrl,
        ...(checkoutExpiresAt !== null
          ? {
              expires: true,
              expiration_date_to: new Date(checkoutExpiresAt).toISOString(),
            }
          : {}),
        metadata: {
          order_id: orderId,
          buyer_id: user.id,
          subtotal: order.subtotal,
          service_charge: order.service_charge,
          total_amount: order.total_amount,
          frozen_pricing: true,
        },
      },
    })

    const initPoint = created.init_point ?? created.sandbox_init_point
    const preferenceId = created.id

    if (!initPoint || !preferenceId) {
      return {
        success: false,
        error: "Mercado Pago no devolvió una URL de checkout.",
      }
    }

    const admin = createAdminClient()
    const { data: updatedOrder, error: updateError } = await admin
      .from("orders")
      .update({ mp_preference_id: preferenceId })
      .eq("id", orderId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle()

    if (updateError || !updatedOrder) {
      logger.error({
        context: "payments/preference",
        message: "preference_persist_failed",
        orderId,
        userId: user.id,
        preferenceId,
        error: updateError?.message ?? "order_not_pending",
      })
      return {
        success: false,
        error: "No se pudo guardar la preferencia de pago.",
      }
    }

    return {
      success: true,
      initPoint,
      preferenceId,
    }
  } catch (error) {
    logger.error({
      context: "payments/preference",
      message: "preference_creation_failed",
      orderId,
      userId: user.id,
      error,
    })

    return {
      success: false,
      error: "Mercado Pago no está disponible en este momento.",
    }
  }
}
