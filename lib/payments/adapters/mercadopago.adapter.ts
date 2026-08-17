import "server-only"

import { Preference, Payment, WebhookSignatureValidator } from "mercadopago"

import { resolveCheckoutExpiresAt } from "@/lib/checkout-hold"
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
import { buildPreferencePayer } from "@/lib/payments/mercadopago"
import {
  invalidWebhookResult,
  PaymentProviderUnavailableError,
} from "@/lib/payments/core/errors"
import type {
  CheckoutResult,
  CreateCheckoutInput,
  IPaymentGatewayAdapter,
  WebhookVerificationResult,
} from "@/lib/payments/core/interfaces"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null
  return value as Record<string, unknown>
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim()
  }
  return null
}

function mapMpStatus(
  status: string | null,
): WebhookVerificationResult["status"] {
  if (status === "approved") return "approved"
  if (
    status === "rejected" ||
    status === "cancelled" ||
    status === "refunded" ||
    status === "charged_back"
  ) {
    return "rejected"
  }
  return "pending"
}

async function extractPaymentId(req: Request): Promise<string | null> {
  const url = new URL(req.url)
  const queryDataId = url.searchParams.get("data.id")
  const queryId = url.searchParams.get("id")
  const topic = url.searchParams.get("topic") ?? url.searchParams.get("type")

  if (queryDataId) return queryDataId
  if ((topic === "payment" || topic?.startsWith("payment.")) && queryId) {
    return queryId
  }

  try {
    const raw = await req.text()
    if (!raw.trim()) return queryId
    const body = JSON.parse(raw) as unknown
    const record = asRecord(body)
    if (!record) return queryId

    const data = asRecord(record.data)
    if (data?.id != null) return String(data.id)

    const kind =
      firstString(record.type) ??
      firstString(record.action) ??
      firstString(record.topic) ??
      topic
    if (
      (kind === "payment" ||
        kind === "payment.created" ||
        kind === "payment.updated" ||
        String(kind ?? "").startsWith("payment.")) &&
      (record.id != null || queryId)
    ) {
      return record.id != null ? String(record.id) : queryId
    }
    if (record.id != null) return String(record.id)
  } catch {
    return queryId
  }

  return queryId
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
      const created = await preference.create({
        body: {
          items: [
            {
              id: `order-${input.orderId}-all-in`,
              title: input.description.slice(0, 256),
              quantity: 1,
              unit_price: input.amount,
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
      })

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

    const paymentId = await extractPaymentId(req)
    if (!paymentId) {
      return invalidWebhookResult({ reason: "missing_payment_id" })
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature: req.headers.get("x-signature"),
        xRequestId: req.headers.get("x-request-id"),
        dataId: paymentId,
        secret,
        toleranceSeconds: 300,
      })
    } catch {
      return invalidWebhookResult({
        reason: "invalid_signature",
        paymentId,
      })
    }

    try {
      const client = getMercadoPagoClient()
      const paymentClient = new Payment(client)
      const payment = await paymentClient.get({ id: paymentId })
      const orderId = firstString(payment.external_reference) ?? ""
      const amount = Number(payment.transaction_amount ?? 0)

      return {
        isValid: Boolean(orderId),
        orderId,
        transactionId: paymentId,
        status: mapMpStatus(firstString(payment.status)),
        amount: Number.isFinite(amount) ? amount : 0,
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
