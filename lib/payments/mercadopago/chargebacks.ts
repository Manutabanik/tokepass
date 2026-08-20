import "server-only"

import { logger } from "@/lib/logger"
import { getMercadoPagoAccessToken } from "@/lib/mercadopago"
import { circuitFetch } from "@/lib/resilience/circuit-breaker"

function firstId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (Array.isArray(value) && value[0] != null) return firstId(value[0])
  return null
}

export async function resolveMercadoPagoChargebackPaymentId(
  chargebackId: string,
): Promise<string | null> {
  const id = chargebackId.trim()
  if (!id) return null

  try {
    const token = getMercadoPagoAccessToken()
    const response = await circuitFetch(
      "mercadopago",
      `https://api.mercadopago.com/v1/chargebacks/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    )

    if (!response.ok) {
      logger.error({
        context: "webhooks/mercadopago",
        message: "chargeback_fetch_failed",
        chargeback_id: id,
        status: response.status,
      })
      return null
    }

    const payload = (await response.json()) as {
      payments?: unknown
      payment_id?: unknown
      payment?: { id?: unknown }
    }

    return (
      firstId(payload.payments) ??
      firstId(payload.payment_id) ??
      firstId(payload.payment?.id)
    )
  } catch (error) {
    logger.error({
      context: "webhooks/mercadopago",
      message: "chargeback_resolve_error",
      chargeback_id: id,
      error,
    })
    return null
  }
}
