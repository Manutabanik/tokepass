"use server"

import { revalidatePath } from "next/cache"

import { resolveCheckoutExpiresAt } from "@/lib/checkout-hold"
import {
  type CheckoutBuyerInfo,
  type NormalizedCheckoutBuyer,
} from "@/lib/checkout-buyer"
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
import { consumeRateLimit } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { PaymentProvider } from "@/types/database"
import {
  CheckoutPayloadSchema,
  buyerToHolderFields,
  formatCheckoutPayloadError,
  type CheckoutAddonItem,
  type CheckoutCartItem,
} from "@/lib/validations/checkout"

const EVENT_FINISHED_ERROR = "El evento ya ha finalizado"
const EVENT_SOLD_OUT_ERROR = "El evento o sector se encuentra agotado"
const GENERIC_CHECKOUT_ERROR =
  "Ocurrió un error al procesar tu solicitud"

export type { CheckoutCartItem, CheckoutAddonItem }

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
    captureCriticalException(error, "checkout/cleanup", { orderId })
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
    parsed.data.items ?? [{ tierId, quantity }],
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
    { paymentProvider: parsed.data.paymentProvider },
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
  options?: {
    sandbox?: boolean
    paymentProvider?: SupportedPaymentProvider
  },
): Promise<CheckoutResult> {
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
    paymentProvider: options?.paymentProvider,
  })
  if (!parsed.success) {
    return { success: false, error: formatCheckoutPayloadError(parsed.error) }
  }

  const payload = parsed.data
  const cartItems = payload.items ?? items
  const buyer = buyerToHolderFields(payload.buyer) satisfies NormalizedCheckoutBuyer
  const seatingItems = cartItems.filter(
    (item) => item.seatingUnitId || (item.seatingIds?.length ?? 0) > 0,
  )

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "auth_required" }
  }

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
    supabase
      .from("events")
      .select("date, ends_at, schedule_days, title")
      .eq("id", payload.eventId)
      .maybeSingle(),
    supabase
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

  const tierIds = [...new Set(cartItems.map((item) => item.tierId))]
  const { data: tierMeta } = await supabase
    .from("ticket_tiers")
    .select("id, seating_sector_id")
    .eq("event_id", payload.eventId)
    .in("id", tierIds)

  const sectorByTier = new Map(
    (tierMeta ?? []).map((row) => [row.id, row.seating_sector_id]),
  )

  const rpcItems = cartItems.map((item) => ({
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
        p_event_id: payload.eventId,
      })
    } catch {
      // RPC ausente en entornos sin P22 todavía — reserve_tickets_tx cubre el caso.
    }

    const seatingItem = seatingItems[0]
    const seatingUnitId =
      seatingItem?.seatingUnitId ??
      seatingItem?.seatingIds?.[0] ??
      payload.seatingIds?.[0]
    const reservation = seatingUnitId
      ? await supabase.rpc("reserve_seating_unit_tx", {
          p_event_id: payload.eventId,
          p_owner_id: user.id,
          p_tier_id: seatingItem?.tierId ?? cartItems[0]?.tierId,
          p_seating_unit_id: seatingUnitId,
          p_promoter_id: promoterId,
        })
      : await supabase.rpc("reserve_tickets_tx", {
          p_event_id: payload.eventId,
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

    if (payload.addons.length > 0) {
      const { error: addonsError } = await supabase.rpc(
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

        if (mapReserveRpcError(addonsError.message)) {
          return { success: false, error: "out_of_stock" }
        }

        return {
          success: false,
          error: "No se pudieron reservar las consumiciones.",
        }
      }
    }

    const cleanPromoId = payload.promoCodeId
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
    const useSandbox = Boolean(payload.sandbox)

    if (useSandbox) {
      const allowed = await assertSandboxCheckoutAllowed(payload.eventId, user.id)
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
    revalidatePath(`/events/${payload.eventId}`)
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
      paymentUrl: initPoint,
      expiresAt,
      ...(reservedUntil ? { reservedUntil } : {}),
    }
  } catch (error) {
    if (pendingOrderId) {
      await cleanupPendingOrder(pendingOrderId)
    }

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
  const parsed = CheckoutPayloadSchema.safeParse({
    eventId,
    items,
    addons,
    buyer: buyerInfo,
    referralCode,
    promoCodeId,
    sandbox: true,
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
