"use server"

import { Preference } from "mercadopago"

import { resolveCheckoutExpiresAt } from "@/lib/checkout-hold"
import { logger } from "@/lib/logger"
import { normalizeCheckoutBuyer } from "@/lib/checkout-buyer"
import {
  getMercadoPagoClient,
  getMercadoPagoSandboxBuyerEmail,
  getSiteUrl,
  isLocalSiteUrl,
  isMercadoPagoSandboxMode,
  isMercadoPagoSandboxToken,
  resolveCheckoutInitPoint,
} from "@/lib/mercadopago"
import {
  buildCheckoutBackUrls,
  buildPreferencePayer,
} from "@/lib/payments/mercadopago"
import {
  expireCheckoutPreferenceOnOrder,
  invalidateStaleCheckoutPreferences,
} from "@/lib/payments/stale-preferences"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type CreatePreferenceResult =
  | { success: true; initPoint: string; paymentUrl: string; preferenceId: string }
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
      "id, buyer_id, total_amount, subtotal, service_charge, status, mp_preference_id, created_at",
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
  const isStoreOnlyOrder = rows.length === 0

  let eventTitle = rows[0]?.events?.title ?? "Evento Tokepass"
  let eventId = rows[0]?.events?.id ?? ""

  if (isStoreOnlyOrder) {
    const { data: storeRows, error: storeError } = await supabase
      .from("item_redemptions")
      .select("id, event_items(name, events(id, title))")
      .eq("order_id", orderId)
      .limit(5)

    if (storeError || !storeRows?.length) {
      return {
        success: false,
        error: "La orden no tiene tickets ni productos asociados.",
      }
    }

    type StoreJoin = {
      event_items: {
        name: string
        events: { id: string; title: string } | null
      } | null
    }
    const first = storeRows[0] as unknown as StoreJoin
    eventTitle =
      first.event_items?.events?.title ??
      "Tokepass — Tienda de Extras"
    eventId = first.event_items?.events?.id ?? eventId
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

  // Preferencia MP: expires + expiration_date_to = fin del hold (máx. now+8m;
  // seating usa reserved_until si es más corto). Preference API field name.
  const seatingExpirations = rows
    .map((row) => row.seating_unit?.reserved_until)
    .filter((value): value is string => Boolean(value))
  const earliestSeating =
    seatingExpirations.length > 0
      ? seatingExpirations.reduce((a, b) =>
          new Date(a).getTime() <= new Date(b).getTime() ? a : b,
        )
      : null
  const checkoutExpiresAt = resolveCheckoutExpiresAt(earliestSeating).getTime()

  if (checkoutExpiresAt <= Date.now()) {
    return {
      success: false,
      error:
        earliestSeating
          ? "La reserva de ubicación venció. Elegí tu ubicación nuevamente."
          : "El tiempo para pagar esta orden venció. Volvé a armar el carrito.",
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, dni, email")
    .eq("id", user.id)
    .maybeSingle()

  const { data: holderTicket } = await supabase
    .from("tickets")
    .select("holder_name, holder_dni, holder_email")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle()

  const buyer = normalizeCheckoutBuyer({
    buyerName:
      holderTicket?.holder_name ?? profile?.full_name ?? "",
    buyerDni: holderTicket?.holder_dni ?? profile?.dni ?? "",
    buyerEmail:
      holderTicket?.holder_email ?? profile?.email ?? user.email ?? "",
  })

  const preferenceItems: Array<{
    id: string
    title: string
    quantity: number
    unit_price: number
    currency_id: "ARS"
  }> = [
    {
      id: `order-${orderId}-all-in`,
      title: (isStoreOnlyOrder
        ? `${eventTitle} — extras`
        : `${eventTitle} — entradas`
      ).slice(0, 256),
      quantity: 1,
      unit_price: frozenTotal,
      currency_id: "ARS",
    },
  ]

  const siteUrl = getSiteUrl()
  const urls = buildCheckoutBackUrls(siteUrl, orderId)
  const sandboxMode = isMercadoPagoSandboxMode()
  const localSite = isLocalSiteUrl(siteUrl)
  const payer = buildPreferencePayer({
    email: buyer?.buyerEmail ?? profile?.email ?? user.email,
    fullName: buyer?.buyerName ?? profile?.full_name,
    dni: buyer?.buyerDni ?? profile?.dni,
    sandboxMode,
    sandboxBuyerEmail: getMercadoPagoSandboxBuyerEmail(),
  })
  // UUID plano: más compatible con MP que JSON en external_reference.
  const externalReference = orderId

  try {
    await expireCheckoutPreferenceOnOrder(orderId)
    if (eventId) {
      await invalidateStaleCheckoutPreferences({
        buyerId: user.id,
        eventId,
        exceptOrderId: orderId,
      })
    }
  } catch (error) {
    logger.error({
      context: "payments/preference",
      message: "stale_preference_invalidate_failed",
      orderId,
      eventId,
      error,
    })
  }

  try {
    const client = getMercadoPagoClient()
    const preference = new Preference(client)

    const created = await preference.create({
      body: {
        items: preferenceItems,
        ...(payer ? { payer } : {}),
        external_reference: externalReference,
        statement_descriptor: "TOKEPASS",
        back_urls: {
          success: urls.success,
          failure: urls.failure,
          pending: urls.pending,
        },
        // auto_return exige HTTPS público; con localhost MP muestra "Algo salió mal".
        ...(!localSite ? { auto_return: "approved" as const } : {}),
        // notification_url localhost es inalcanzable para MP; omitir en local.
        ...(!localSite ? { notification_url: urls.notificationUrl } : {}),
        // Preference API: expires + expiration_date_to (= now+8m o reserved_until).
        expires: true,
        expiration_date_to: new Date(checkoutExpiresAt).toISOString(),
        metadata: {
          order_id: orderId,
          buyer_id: user.id,
          buyer_name: buyer?.buyerName ?? null,
          buyer_dni: buyer?.buyerDni ?? null,
          buyer_email: buyer?.buyerEmail ?? null,
          subtotal: order.subtotal,
          service_charge: order.service_charge,
          total_amount: order.total_amount,
          frozen_pricing: true,
          sandbox_mode: sandboxMode,
        },
      },
    })

    const initPoint = resolveCheckoutInitPoint(created)
    const preferenceId = created.id

    if (!preferenceId) {
      return {
        success: false,
        error: "Mercado Pago no devolvió una preferencia válida.",
      }
    }

    if (!initPoint) {
      logger.error({
        context: "payments/preference",
        message: "sandbox_init_point_missing",
        orderId,
        sandboxMode,
        testToken: isMercadoPagoSandboxToken(),
        hasSandboxInitPoint: Boolean(created.sandbox_init_point),
        hasInitPoint: Boolean(created.init_point),
      })
      return {
        success: false,
        error:
          "Sandbox no devolvió sandbox_init_point. Usá credenciales TEST- de Mercado Pago (no APP_USR de producción) en MP_ACCESS_TOKEN.",
      }
    }

    if (sandboxMode && !/sandbox/i.test(initPoint)) {
      return {
        success: false,
        error:
          "La URL de checkout no es de Sandbox. Verificá que MP_ACCESS_TOKEN empiece con TEST-.",
      }
    }

    logger.info({
      context: "payments/preference",
      message: "checkout_redirect_url",
      orderId,
      sandboxMode,
      redirectUrl: initPoint,
      hasSandboxInitPoint: Boolean(created.sandbox_init_point),
      hasInitPoint: Boolean(created.init_point),
    })

    const admin = createAdminClient()
    const { data: updatedOrder, error: updateError } = await admin
      .from("orders")
      .update({
        mp_preference_id: preferenceId,
        payment_provider: "mercadopago",
        provider_preference_id: preferenceId,
      })
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
      paymentUrl: initPoint,
      preferenceId,
    }
  } catch (error) {
    console.error("Error creating MP Preference:", error)
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
