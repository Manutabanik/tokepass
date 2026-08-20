import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from "mercadopago"
import { after, NextResponse, type NextRequest } from "next/server"

import { logger } from "@/lib/logger"
import { getMercadoPagoWebhookSecret } from "@/lib/mercadopago"
import { resolveMercadoPagoChargebackPaymentId } from "@/lib/payments/mercadopago/chargebacks"
import { parseMercadoPagoNotification } from "@/lib/payments/mercadopago/parse-notification"
import { processEnqueuedWebhookEvent } from "@/lib/payments/mercadopago/process-enqueued"
import { enqueueMercadoPagoWebhook } from "@/lib/payments/webhook-queue"
import { captureCriticalException } from "@/lib/sentry/capture"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function webhookOk(data?: Record<string, unknown>) {
  return NextResponse.json({ received: true, ...(data ?? {}) }, { status: 200 })
}

export async function POST(request: NextRequest) {
  const secret = getMercadoPagoWebhookSecret()
  if (!secret) {
    console.error("[WEBHOOK ERROR] webhook secret missing — fail closed")
    logger.error({
      context: "webhooks/mercadopago",
      message: "webhook_secret_missing",
    })
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    )
  }

  try {
    const rawBody = await request.text()
    const notification = parseMercadoPagoNotification(request.url, rawBody)

    if (!notification) {
      return webhookOk({ ignored: true, reason: "missing_payment_id" })
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature: request.headers.get("x-signature"),
        xRequestId: request.headers.get("x-request-id"),
        dataId: notification.id,
        secret,
        toleranceSeconds: 300,
      })
    } catch (error) {
      console.error("[WEBHOOK ERROR] signature validation:", error)
      logger.error({
        context: "webhooks/mercadopago",
        message: "invalid_signature",
        payment_id: notification.id,
        reason:
          error instanceof InvalidWebhookSignatureError
            ? error.reason
            : "signature_error",
      })
      return webhookOk({ ignored: true, reason: "invalid_signature" })
    }

    let paymentId = notification.id
    if (notification.kind === "chargeback") {
      const resolved = await resolveMercadoPagoChargebackPaymentId(
        notification.id,
      )
      if (!resolved) {
        logger.error({
          context: "webhooks/mercadopago",
          message: "chargeback_payment_unresolved",
          chargeback_id: notification.id,
        })
        return NextResponse.json({ received: false }, { status: 500 })
      }
      paymentId = resolved
    }

    let payload: unknown = { raw: rawBody, paymentId }
    try {
      payload = rawBody.trim() ? JSON.parse(rawBody) : payload
    } catch {
      payload = { raw: rawBody, paymentId }
    }

    const queued = await enqueueMercadoPagoWebhook({
      paymentId,
      eventType:
        notification.kind === "chargeback"
          ? "chargebacks"
          : (request.nextUrl.searchParams.get("type") ??
            request.nextUrl.searchParams.get("topic") ??
            "payment"),
      payload,
    })

    if (!queued) {
      return NextResponse.json({ received: false }, { status: 500 })
    }

    if (queued.status !== "processed") {
      after(() => processEnqueuedWebhookEvent(queued.id))
    }

    return webhookOk()
  } catch (error) {
    captureCriticalException(error, "webhooks/mercadopago")
    console.error("[WEBHOOK ERROR]", error)
    logger.error({
      context: "webhooks/mercadopago",
      message: "unexpected_webhook_error",
      error,
    })
    return NextResponse.json({ received: false }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
