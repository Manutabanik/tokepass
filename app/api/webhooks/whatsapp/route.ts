import { createHmac, timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { logger } from "@/lib/logger"
import { captureCriticalException } from "@/lib/sentry/capture"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const LOG_CONTEXT = "webhooks/whatsapp"

type WhatsAppMessage = {
  id?: string
  type?: string
  timestamp?: string
}

type WhatsAppStatus = {
  id?: string
  status?: string
  timestamp?: string
}

type WhatsAppChange = {
  field?: string
  value?: {
    metadata?: { phone_number_id?: string }
    messages?: WhatsAppMessage[]
    statuses?: WhatsAppStatus[]
  }
}

type WhatsAppWebhookPayload = {
  object?: string
  entry?: Array<{ id?: string; changes?: WhatsAppChange[] }>
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Meta firma cada entrega con HMAC-SHA256 del cuerpo crudo. Si el App Secret no
 * está configurado se acepta la entrega para no bloquear la conexión inicial,
 * pero se registra como error: es una brecha abierta, no un estado válido.
 */
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim()

  if (!secret) {
    logger.error({
      context: LOG_CONTEXT,
      message: "app_secret_missing_accepting_unverified",
    })
    return true
  }

  if (!header?.startsWith("sha256=")) return false

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  return safeEqual(header.slice("sha256=".length), expected)
}

/**
 * Resumen sin datos personales: el payload trae el teléfono del cliente
 * (`from`, `wa_id`) y el texto del mensaje (`body`), y el scrubber del logger no
 * cubre esas claves. Los ids `wamid.*` son opacos y sí sirven para trazar.
 */
function summarize(payload: WhatsAppWebhookPayload) {
  return {
    object: payload.object,
    entries: payload.entry?.length ?? 0,
    changes:
      payload.entry?.flatMap((entry) =>
        (entry.changes ?? []).map((change) => ({
          field: change.field,
          businessNumberId: change.value?.metadata?.phone_number_id,
          messages: (change.value?.messages ?? []).map((message) => ({
            id: message.id,
            type: message.type,
            timestamp: message.timestamp,
          })),
          statuses: (change.value?.statuses ?? []).map((status) => ({
            id: status.id,
            status: status.status,
            timestamp: status.timestamp,
          })),
        })),
      ) ?? [],
  }
}

function accepted(data?: Record<string, unknown>) {
  return NextResponse.json({ received: true, ...(data ?? {}) }, { status: 200 })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token")
  const challenge = params.get("hub.challenge")

  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim()

  if (!expected) {
    logger.error({
      context: LOG_CONTEXT,
      message: "verify_token_not_configured",
    })
    return new NextResponse("Forbidden", { status: 403 })
  }

  if (mode !== "subscribe" || !token || !challenge || !safeEqual(token, expected)) {
    logger.warn({
      context: LOG_CONTEXT,
      message: "verification_rejected",
      mode,
      hasToken: Boolean(token),
      hasChallenge: Boolean(challenge),
    })
    return new NextResponse("Forbidden", { status: 403 })
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    // Ante cualquier status distinto de 200 Meta reintenta la entrega. Una firma
    // inválida o un cuerpo ilegible no mejoran reintentando, así que se acepta
    // el request y se descarta el contenido.
    if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      logger.error({ context: LOG_CONTEXT, message: "invalid_signature" })
      return accepted({ ignored: true, reason: "invalid_signature" })
    }

    let payload: WhatsAppWebhookPayload
    try {
      payload = JSON.parse(rawBody) as WhatsAppWebhookPayload
    } catch {
      logger.error({ context: LOG_CONTEXT, message: "invalid_json" })
      return accepted({ ignored: true, reason: "invalid_json" })
    }

    logger.info({
      context: LOG_CONTEXT,
      message: "incoming_webhook",
      ...summarize(payload),
    })

    if (process.env.WHATSAPP_DEBUG_PAYLOAD === "1") {
      logger.warn({
        context: LOG_CONTEXT,
        message: "incoming_webhook_raw_payload",
        payload,
      })
    }

    return accepted()
  } catch (error) {
    captureCriticalException(error, LOG_CONTEXT)
    logger.error({
      context: LOG_CONTEXT,
      message: "unexpected_webhook_error",
      error,
    })
    return accepted({ ignored: true, reason: "unexpected_error" })
  }
}
