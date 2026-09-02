import { assertPendingOrderStillReservable } from "@/lib/checkout/assert-order-stock"
import { logger } from "@/lib/logger"
import { getSiteUrl } from "@/lib/mercadopago"
import { GENERIC_CHECKOUT_ERROR } from "@/lib/modules/checkout/constants/checkout-errors"
import type { CheckoutSupabase } from "@/lib/modules/checkout/types/checkout.types"
import {
  PaymentProviderNotSupportedError,
  PaymentProviderUnavailableError,
} from "@/lib/payments/core/errors"
import { PaymentGatewayFactory } from "@/lib/payments/core/factory"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"
import { freezeSeatHoldsForPayment } from "@/lib/payments/freeze-seat-holds"
import { buildCheckoutBackUrls } from "@/lib/payments/mercadopago"
import {
  expireCheckoutPreferenceOnOrder,
  invalidateStaleCheckoutPreferences,
} from "@/lib/payments/stale-preferences"
import { captureCriticalException } from "@/lib/sentry/capture"
import { createAdminClient } from "@/lib/supabase/admin"
import type { PaymentProvider } from "@/types/database"

export type OpenPaymentSessionInput = {
  provider: SupportedPaymentProvider
  orderId: string
  db: CheckoutSupabase
  buyerId: string
  eventId: string
  eventTitle: string | null | undefined
  amount: number
  buyer: {
    name: string
    email: string
    dni: string
  }
  checkoutExpiresAt: string
  /**
   * Compensación inyectada: el caller decide cómo revertir la orden pendiente.
   * Se recibe como callback para que el orden de los efectos secundarios sea
   * idéntico al del flujo original (cleanup antes de loggear y retornar).
   */
  cleanupPendingOrder: (orderId: string) => Promise<void>
}

export type OpenPaymentSessionResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string }

/**
 * Abre la sesión de pago contra la pasarela y persiste la preferencia en la
 * orden. Al salir bien, los holds quedan congelados y se devuelve la URL de
 * cobro; ante cualquier fallo la orden pendiente ya fue compensada.
 */
export async function openCheckoutPaymentSession(
  input: OpenPaymentSessionInput,
): Promise<OpenPaymentSessionResult> {
  const {
    provider,
    orderId,
    db,
    buyerId,
    eventId,
    eventTitle,
    amount,
    buyer,
    checkoutExpiresAt,
    cleanupPendingOrder,
  } = input

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
    return { ok: false, error: message }
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
    return { ok: false, error: stockGate.error }
  }

  try {
    await expireCheckoutPreferenceOnOrder(orderId)
    await invalidateStaleCheckoutPreferences({
      buyerId,
      eventId,
      exceptOrderId: orderId,
    })
  } catch (error) {
    logger.error({
      context: "checkout/payment",
      message: "stale_preference_invalidate_failed",
      orderId,
      eventId,
      error,
    })
  }

  try {
    const session = await adapter.createCheckoutSession({
      orderId,
      amount,
      currency: "ARS",
      description: `${eventTitle ?? "TokePass"} — entradas`.slice(0, 256),
      buyer: {
        name: buyer.name,
        email: buyer.email,
        dni: buyer.dni,
      },
      items: [
        {
          title: `${eventTitle ?? "TokePass"} — entradas`,
          quantity: 1,
          unitPrice: amount,
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
      return { ok: false, error: GENERIC_CHECKOUT_ERROR }
    }

    await freezeSeatHoldsForPayment(orderId)
    return { ok: true, checkoutUrl: session.checkoutUrl }
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
      ok: false,
      error:
        error instanceof PaymentProviderUnavailableError
          ? error.message
          : GENERIC_CHECKOUT_ERROR,
    }
  }
}
