import "server-only"

import { logger } from "@/lib/logger"
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
import { verifyWebhookSignature } from "@/lib/payments/core/webhook-secret"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null
  return value as Record<string, unknown>
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function getPaywayConfig(): { baseUrl: string; apiKey: string; siteId: string } | null {
  const baseUrl = process.env.PAYWAY_API_BASE_URL?.trim()
  const apiKey =
    process.env.PAYWAY_PRIVATE_KEY?.trim() ||
    process.env.PAYWAY_API_KEY?.trim() ||
    ""
  const siteId =
    process.env.PAYWAY_SITE_ID?.trim() ||
    process.env.PAYWAY_PUBLIC_KEY?.trim() ||
    ""

  if (!baseUrl || !apiKey || !siteId) return null
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, siteId }
}

export class PaywayAdapter implements IPaymentGatewayAdapter {
  readonly provider = "payway" as const

  async createCheckoutSession(
    input: CreateCheckoutInput,
  ): Promise<CheckoutResult> {
    const config = getPaywayConfig()
    if (!config) {
      throw new PaymentProviderUnavailableError(
        this.provider,
        "Payway aún no está habilitado. Configurá PAYWAY_API_BASE_URL, PAYWAY_PRIVATE_KEY y PAYWAY_SITE_ID.",
      )
    }

    const response = await fetch(`${config.baseUrl}/payments/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
        "X-Site-Id": config.siteId,
      },
      body: JSON.stringify({
        site_id: config.siteId,
        external_reference: input.orderId,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        payer: input.buyer,
        items: input.items,
        success_url: input.redirectUrls.success,
        failure_url: input.redirectUrls.failure,
        pending_url: input.redirectUrls.pending,
        notification_url: input.webhookUrl,
      }),
    })

    const payload: unknown = await response.json().catch(() => null)
    const record = asRecord(payload)

    if (!response.ok || !record) {
      logger.error({
        context: "payments/adapter/payway",
        message: "checkout_session_failed",
        orderId: input.orderId,
        status: response.status,
      })
      throw new PaymentProviderUnavailableError(
        this.provider,
        "Payway no pudo iniciar el checkout.",
      )
    }

    const preferenceId =
      readString(record, "id") ?? readString(record, "preference_id") ?? ""
    const checkoutUrl =
      readString(record, "checkout_url") ??
      readString(record, "redirect_url") ??
      ""

    if (!preferenceId || !checkoutUrl) {
      throw new PaymentProviderUnavailableError(
        this.provider,
        "Payway no devolvió una URL de checkout válida.",
      )
    }

    return {
      provider: this.provider,
      preferenceId,
      checkoutUrl,
      rawResponse: payload,
    }
  }

  async verifyWebhook(req: Request): Promise<WebhookVerificationResult> {
    const config = getPaywayConfig()
    if (!config) {
      return invalidWebhookResult({ reason: "payway_not_configured" })
    }

    const provided = req.headers.get("x-payway-signature") ?? ""
    if (!verifyWebhookSignature(provided, process.env.PAYWAY_WEBHOOK_SECRET)) {
      return invalidWebhookResult({ reason: "invalid_or_missing_webhook_secret" })
    }

    try {
      const payload: unknown = await req.json()
      const record = asRecord(payload)
      if (!record) return invalidWebhookResult(payload)

      const orderId =
        readString(record, "external_reference") ??
        readString(record, "order_id") ??
        ""
      const transactionId =
        readString(record, "payment_id") ?? readString(record, "id") ?? ""
      const statusRaw = (readString(record, "status") ?? "pending").toLowerCase()
      const amount = Number(record.amount ?? 0)

      const status =
        statusRaw === "approved" || statusRaw === "accredited"
          ? "approved"
          : statusRaw === "rejected" || statusRaw === "cancelled"
            ? "rejected"
            : "pending"

      return {
        isValid: Boolean(orderId && transactionId),
        orderId,
        transactionId,
        status,
        amount: Number.isFinite(amount) ? amount : 0,
        rawPayload: payload,
      }
    } catch {
      return invalidWebhookResult({ reason: "invalid_json" })
    }
  }
}
