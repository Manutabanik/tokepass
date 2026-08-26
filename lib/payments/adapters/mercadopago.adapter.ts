import "server-only"

import { Preference, Payment, WebhookSignatureValidator } from "mercadopago"

import { resolveCheckoutExpiresAt } from "@/lib/checkout-hold"
import { moneyToGatewayMajorUnits } from "@/lib/money/cents"
import { logger } from "@/lib/logger"
import {
  getMercadoPagoClient,
  getMercadoPagoSandboxBuyerEmail,
  getMercadoPagoWebhookSecret,
  isLocalSiteUrl,
  isMercadoPagoSandboxMode,
  isMercadoPagoSandboxToken,
  resolveCheckoutInitPoint,
} from "@/lib/mercadopago"
import { mapGatewayPaymentStatus } from "@/lib/payments/core/map-gateway-status"
import { buildPreferencePayer } from "@/lib/payments/mercadopago"
import { resolveMercadoPagoChargebackPaymentId } from "@/lib/payments/mercadopago/chargebacks"
import { parseMercadoPagoNotification } from "@/lib/payments/mercadopago/parse-notification"
import {
  invalidWebhookResult,
  PaymentProviderUnavailableError,
} from "@/lib/payments/core/errors"
import {
  CircuitOpenError,
  withCircuit,
} from "@/lib/resilience/circuit-breaker"
import type {
  CheckoutResult,
  CreateCheckoutInput,
  IPaymentGatewayAdapter,
  WebhookVerificationResult,
} from "@/lib/payments/core/interfaces"

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim()
  }
  return null
}

async function extractSignedResourceId(req: Request): Promise<{
  kind: "payment" | "chargeback"
  id: string
} | null> {
  const raw = await req.text()
  return parseMercadoPagoNotification(req.url, raw)
}

export class MercadoPagoAdapter implements IPaymentGatewayAdapter {
  readonly provider = "mercadopago" as const

  async createCheckoutSession(
    input: CreateCheckoutInput,
  ): Promise<CheckoutResult> {
    const sandboxMode = isMercadoPagoSandboxMode()
    const localSite = isLocalSiteUrl(input.redirectUrls.success)
    const payer = buildPreferencePayer({
      email: input.buyer.email,
      fullName: input.buyer.name,
      dni: input.buyer.dni,
      sandboxMode,
      sandboxBuyerEmail: getMercadoPagoSandboxBuyerEmail(),
    })

    const parsed = input.expiresAt ? new Date(input.expiresAt).getTime() : Number.NaN
    const expiresAt = Number.isFinite(parsed)
      ? new Date(parsed).toISOString()
      : resolveCheckoutExpiresAt().toISOString()

    try {
      const client = getMercadoPagoClient()
      const preference = new Preference(client)
      const created = await withCircuit("mercadopago", () =>
        preference.create({
          body: {
            items: [
              {
                id: `order-${input.orderId}-all-in`,
                title: input.description.slice(0, 256),
                quantity: 1,
                unit_price: moneyToGatewayMajorUnits(input.amount),
                currency_id: input.currency === "USD" ? "USD" : "ARS",
              },
            ],
            ...(payer ? { payer } : {}),
            external_reference: input.orderId,
            statement_descriptor: "TOKEPASS",
            back_urls: {
              success: input.redirectUrls.success,
              failure: input.redirectUrls.failure,
              pending: input.redirectUrls.pending,
            },
            ...(!localSite ? { auto_return: "approved" as const } : {}),
            ...(!localSite ? { notification_url: input.webhookUrl } : {}),
            expires: true,
            expiration_date_to: expiresAt,
            metadata: {
              order_id: input.orderId,
              frozen_pricing: true,
              sandbox_mode: sandboxMode,
            },
          },
        }),
      )

      const checkoutUrl = resolveCheckoutInitPoint(created)
      const preferenceId = created.id?.trim() ?? ""

      if (!preferenceId) {
        throw new PaymentProviderUnavailableError(
          this.provider,
          "Mercado Pago no devolvió una preferencia válida.",
        )
      }

      if (!checkoutUrl) {
        throw new PaymentProviderUnavailableError(
          this.provider,
          sandboxMode
            ? "Sandbox no devolvió sandbox_init_point. Usá credenciales TEST- de Mercado Pago."
            : "Mercado Pago no devolvió una URL de checkout.",
        )
      }

      if (sandboxMode && !/sandbox/i.test(checkoutUrl)) {
        throw new PaymentProviderUnavailableError(
          this.provider,
          "La URL de checkout no es de Sandbox. Verificá que MP_ACCESS_TOKEN empiece con TEST-.",
        )
      }

      logger.info({
        context: "payments/adapter/mercadopago",
        message: "checkout_session_created",
        orderId: input.orderId,
        preferenceId,
        sandboxMode,
        testToken: isMercadoPagoSandboxToken(),
      })

      return {
        provider: this.provider,
        preferenceId,
        checkoutUrl,
        rawResponse: created,
      }
    } catch (error) {
      if (error instanceof PaymentProviderUnavailableError) throw error
      if (error instanceof CircuitOpenError) {
        throw new PaymentProviderUnavailableError(
          this.provider,
          error.message,
        )
      }
      logger.error({
        context: "payments/adapter/mercadopago",
        message: "checkout_session_failed",
        orderId: input.orderId,
        error,
      })
      throw new PaymentProviderUnavailableError(
        this.provider,
        "Mercado Pago no está disponible en este momento.",
      )
    }
  }

  async verifyWebhook(req: Request): Promise<WebhookVerificationResult> {
    const secret = getMercadoPagoWebhookSecret()
    if (!secret) {
      return invalidWebhookResult({ reason: "missing_webhook_secret" })
    }

    const notification = await extractSignedResourceId(req)
    if (!notification) {
      return invalidWebhookResult({ reason: "missing_payment_id" })
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature: req.headers.get("x-signature"),
        xRequestId: req.headers.get("x-request-id"),
        dataId: notification.id,
        secret,
        toleranceSeconds: 300,
      })
    } catch {
      return invalidWebhookResult({
        reason: "invalid_signature",
        paymentId: notification.id,
      })
    }

    let paymentId = notification.id
    if (notification.kind === "chargeback") {
      const resolved = await resolveMercadoPagoChargebackPaymentId(
        notification.id,
      )
      if (!resolved) {
        return invalidWebhookResult({
          reason: "chargeback_payment_unresolved",
          chargebackId: notification.id,
        })
      }
      paymentId = resolved
    }

    try {
      const client = getMercadoPagoClient()
      const paymentClient = new Payment(client)
      const payment = await withCircuit("mercadopago", () =>
        paymentClient.get({ id: paymentId }),
      )
      const orderId = firstString(payment.external_reference) ?? ""
      const amount = Number(payment.transaction_amount ?? 0)
      const currency = firstString(payment.currency_id) ?? ""
      const mapped = mapGatewayPaymentStatus(firstString(payment.status))
      const status =
        notification.kind === "chargeback" &&
        mapped !== "in_mediation" &&
        mapped !== "charged_back" &&
        mapped !== "refunded"
          ? "charged_back"
          : mapped

      return {
        isValid: Boolean(orderId),
        orderId,
        transactionId: paymentId,
        status,
        amount: Number.isFinite(amount) ? amount : 0,
        currency,
        rawPayload: payment,
      }
    } catch (error) {
      logger.error({
        context: "payments/adapter/mercadopago",
        message: "webhook_payment_fetch_failed",
        paymentId,
        error,
      })
      return invalidWebhookResult({ reason: "payment_fetch_failed", paymentId })
    }
  }
}
