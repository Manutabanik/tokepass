/**
 * Contrato Tokepass → Gobi: despacha `order.paid` con firma HMAC-SHA256.
 *
 * Env:
 * - GOBI_WEBHOOK_URL
 * - GOBI_WEBHOOK_SECRET / TOKEPASS_WEBHOOK_SECRET
 *
 * Header: X-Tokepass-Signature: sha256=<hex>
 * Timeout ACK: 3s. Reintentos solo ante 5xx / red (máx 3).
 */

import { createHmac } from "crypto"

import { logger } from "@/lib/logger"

export type GobiOrderPaidPayload = {
  type: "order.paid"
  order_id: string
  event_name: string
  customer_name: string
  customer_phone: string
  ticket_url: string
  access_code?: string
}

export type GobiDispatchResult =
  | { ok: true; status: string; partnerEventId?: string; elapsedMs?: number }
  | { ok: false; status: number; error: string }

const ACK_TIMEOUT_MS = 3_000
const MAX_ATTEMPTS = 3

function readGobiWebhookUrl(): string | null {
  return (
    process.env.GOBI_WEBHOOK_URL?.trim() ||
    process.env.TOKEPASS_GOBI_WEBHOOK_URL?.trim() ||
    null
  )
}

function readGobiWebhookSecret(): string | null {
  return (
    process.env.GOBI_WEBHOOK_SECRET?.trim() ||
    process.env.TOKEPASS_WEBHOOK_SECRET?.trim() ||
    null
  )
}

export function signGobiWebhookPayload(
  rawBody: string,
  secret: string,
): string {
  const hex = createHmac("sha256", secret.trim())
    .update(rawBody, "utf8")
    .digest("hex")
  return `sha256=${hex}`
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function postOnce(
  url: string,
  rawBody: string,
  signature: string,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ACK_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tokepass-Signature": signature,
      },
      body: rawBody,
      signal: controller.signal,
    })

    const text = await response.text()
    let json: Record<string, unknown> = {}
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      json = {}
    }

    if (!response.ok) {
      const error =
        typeof json.error === "string"
          ? json.error
          : `gobi_http_${response.status}`
      return { ok: false, status: response.status, json, error }
    }

    return { ok: true, status: response.status, json }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * POST firmado a Gobi. Fast-ACK esperado: `{ success: true, status: 'queued' }`.
 */
export async function dispatchOrderPaidToGobi(
  payload: Omit<GobiOrderPaidPayload, "type"> & { type?: "order.paid" },
  options?: { throwOnError?: boolean },
): Promise<GobiDispatchResult> {
  const url = readGobiWebhookUrl()
  const secret = readGobiWebhookSecret()

  if (!url || !secret) {
    console.info("[gobi-dispatcher] omitido — GOBI_WEBHOOK_URL/SECRET no configurados", {
      orderId: payload.order_id,
    })
    return { ok: false, status: 0, error: "gobi_not_configured" }
  }

  const body: GobiOrderPaidPayload = {
    type: "order.paid",
    order_id: payload.order_id,
    event_name: payload.event_name,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone,
    ticket_url: payload.ticket_url,
  }

  const rawBody = JSON.stringify(body)
  const signature = signGobiWebhookPayload(rawBody, secret)

  let lastError = "gobi_unknown"
  let lastStatus = 0

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await postOnce(url, rawBody, signature)

      if (result.ok) {
        console.info("[gobi-dispatcher] order.paid encolado en Gobi", {
          orderId: payload.order_id,
          status: result.json.status,
          partnerEventId: result.json.partner_event_id,
          elapsedMs: result.json.elapsed_ms,
          attempt,
        })

        return {
          ok: true,
          status: String(result.json.status ?? "queued"),
          partnerEventId:
            typeof result.json.partner_event_id === "string"
              ? result.json.partner_event_id
              : undefined,
          elapsedMs:
            typeof result.json.elapsed_ms === "number"
              ? result.json.elapsed_ms
              : undefined,
        }
      }

      lastStatus = result.status
      lastError = result.error ?? `gobi_http_${result.status}`

      // 4xx: no reintentar (excepto 408/429)
      const retryable =
        result.status >= 500 || result.status === 408 || result.status === 429

      logger.error({
        context: "services/gobi-dispatcher",
        message: "gobi_rejected_order_paid",
        order_id: payload.order_id,
        status: result.status,
        error: lastError,
        attempt,
        retryable,
      })

      if (!retryable || attempt === MAX_ATTEMPTS) {
        break
      }

      await sleep(200 * attempt)
    } catch (err) {
      lastStatus = 0
      lastError = err instanceof Error ? err.message : String(err)
      logger.error({
        context: "services/gobi-dispatcher",
        message: "gobi_network_or_timeout",
        order_id: payload.order_id,
        error: lastError,
        attempt,
      })

      if (attempt === MAX_ATTEMPTS) break
      await sleep(200 * attempt)
    }
  }

  if (options?.throwOnError) {
    throw new Error(lastError)
  }

  return { ok: false, status: lastStatus, error: lastError }
}
