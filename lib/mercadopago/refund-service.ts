import "server-only"

import { MercadoPagoConfig, PaymentRefund } from "mercadopago"

import { getMercadoPagoClient } from "@/lib/mercadopago"
import { logger } from "@/lib/logger"

export type MercadoPagoRefundRequest = {
  paymentId: string
  /** Si se omite, usa el access token de plataforma (custodia Tier 1). */
  accessToken?: string | null
  amount?: number | null
  reason?: string | null
  /** Fuerza mock auditado (Tier 2/3 sin Connect vinculado). */
  forceMock?: boolean
}

export type MercadoPagoRefundResult =
  | {
      success: true
      paymentId: string
      mode: "platform" | "organizer" | "mock" | "skipped_free"
      refundId: string | null
    }
  | {
      success: false
      paymentId: string
      mode: "platform" | "organizer" | "mock"
      error: string
    }

/**
 * Servicio tipado de reembolsos MP.
 * Tier 1 (custodia) → token de plataforma.
 * Tier 2/3 (split) → token Connect del productor; si falta, mock auditado.
 */
export class MercadoPagoRefundService {
  async refundPayment(
    input: MercadoPagoRefundRequest,
  ): Promise<MercadoPagoRefundResult> {
    const paymentId = input.paymentId?.trim()
    if (!paymentId) {
      return {
        success: false,
        paymentId: "",
        mode: "platform",
        error: "payment_id_required",
      }
    }

    if (paymentId.startsWith("free:")) {
      return {
        success: true,
        paymentId,
        mode: "skipped_free",
        refundId: null,
      }
    }

    if (input.forceMock) {
      logger.error({
        context: "mercadopago/refund-service",
        message: "organizer_token_missing_mock",
        paymentId,
        reason: input.reason ?? null,
      })
      return {
        success: true,
        paymentId,
        mode: "mock",
        refundId: `mock:${paymentId}`,
      }
    }

    const organizerToken = input.accessToken?.trim() || null
    const mode = organizerToken ? "organizer" : "platform"

    try {
      const client = organizerToken
        ? new MercadoPagoConfig({
            accessToken: organizerToken,
            options: { timeout: 12_000 },
          })
        : getMercadoPagoClient()

      const refunds = new PaymentRefund(client)
      const response = await refunds.total({
        payment_id: paymentId,
      })

      return {
        success: true,
        paymentId,
        mode,
        refundId: response?.id != null ? String(response.id) : null,
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "mp_refund_failed"

      logger.error({
        context: "mercadopago/refund-service",
        message: "refund_failed",
        paymentId,
        mode,
        error: message,
      })

      return {
        success: false,
        paymentId,
        mode,
        error: message,
      }
    }
  }
}

export const mercadoPagoRefundService = new MercadoPagoRefundService()
