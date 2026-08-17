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

function getNaranjaXConfig(): {
  baseUrl: string
  apiKey: string
  merchantId: string
} | null {
  const baseUrl = process.env.NARANJAX_API_BASE_URL?.trim()
  const apiKey =
    process.env.NARANJAX_API_KEY?.trim() ||
    process.env.NARANJAX_PRIVATE_KEY?.trim() ||
    ""
  const merchantId = process.env.NARANJAX_MERCHANT_ID?.trim() || ""

  if (!baseUrl || !apiKey || !merchantId) return null
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, merchantId }
}

export class NaranjaXAdapter implements IPaymentGatewayAdapter {
  readonly provider = "naranjax" as const

  async createCheckoutSession(
    input: CreateCheckoutInput,
  ): Promise<CheckoutResult> {
    const config = getNaranjaXConfig()
    if (!config) {
      throw new PaymentProviderUnavailableError(
        this.provider,
        "Naranja X aún no está habilitado. Configurá NARANJAX_API_BASE_URL, NARANJAX_API_KEY y NARANJAX_MERCHANT_ID.",
      )
    }

    const response = await fetch(`${config.baseUrl}/checkout/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "X-Merchant-Id": config.merchantId,
      },
      body: JSON.stringify({
        merchant_id: config.merchantId,
        order_id: input.orderId,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        customer: input.buyer,
        items: input.items,
        redirect_urls: input.redirectUrls,
        webhook_url: input.webhookUrl,
      }),
    })

    const payload: unknown = await response.json().catch(() => null)
    const record = asRecord(payload)

    if (!response.ok || !record) {
      logger.error({
        context: "payments/adapter/naranjax",
        message: "checkout_session_failed",
        orderId: input.orderId,
        status: response.status,
      })
      throw new PaymentProviderUnavailableError(
        this.provider,
        "Naranja X no pudo iniciar el checkout.",
      )
    }

    const preferenceId =
      readString(record, "id") ?? readString(record, "session_id") ?? ""
    const checkoutUrl =
      readString(record, "checkout_url") ??
      readString(record, "redirect_url") ??
      ""

    if (!preferenceId || !checkoutUrl) {
      throw new PaymentProviderUnavailableError(
        this.provider,
        "Naranja X no devolvió una URL de checkout válida.",
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
    const config = getNaranjaXConfig()
    if (!config) {
      return invalidWebhookResult({ reason: "naranjax_not_configured" })
    }

    const provided = req.headers.get("x-naranjax-signature") ?? ""
    if (!verifyWebhookSignature(provided, process.env.NARANJAX_WEBHOOK_SECRET)) {
      return invalidWebhookResult({ reason: "invalid_or_missing_webhook_secret" })
    }

    try {
      const payload: unknown = await req.json()
      const record = asRecord(payload)
      if (!record) return invalidWebhookResult(payload)

      const orderId =
        readString(record, "order_id") ??
        readString(record, "external_reference") ??
        ""
      const transactionId =
        readString(record, "transaction_id") ??
        readString(record, "payment_id") ??
        ""
      const statusRaw = (readString(record, "status") ?? "pending").toLowerCase()
      const amount = Number(record.amount ?? 0)

      const status =
        statusRaw === "approved" || statusRaw === "paid"
          ? "approved"
          : statusRaw === "rejected" || statusRaw === "failed"
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
