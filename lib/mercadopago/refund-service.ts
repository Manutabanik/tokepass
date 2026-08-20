import "server-only"

import { MercadoPagoConfig, Payment, PaymentRefund } from "mercadopago"

import { getMercadoPagoClient } from "@/lib/mercadopago"
import { logger } from "@/lib/logger"
import { withCircuit } from "@/lib/resilience/circuit-breaker"
import {
  isWithinMercadoPagoRefundWindow,
  parseMercadoPagoPaidAt,
} from "@/lib/mercadopago/refund-window"

export type MercadoPagoRefundRequest = {
  paymentId: string
  /** Si se omite, usa el access token de plataforma (custodia Tier 1). */
  accessToken?: string | null
  amount?: number | null
  reason?: string | null
  /** Fecha de aprobacion/creacion del cobro original (date_approved). */
  paidAt?: Date | string | number | null
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
        message: "organizer_token_missing_refused",
        paymentId,
        reason: input.reason ?? null,
      })
      return {
        success: false,
        paymentId,
        mode: "mock",
        error: "organizer_token_missing",
      }
    }

    const organizerToken = input.accessToken?.trim() || null
    const mode = organizerToken ? "organizer" : "platform"

    try {
      const client = organizerToken
        ? new MercadoPagoConfig({
            accessToken: organizerToken,
            options: { timeout: 8_000 },
          })
        : getMercadoPagoClient()

      let paidAt = parseMercadoPagoPaidAt(input.paidAt)
      if (!paidAt) {
        const paymentClient = new Payment(client)
        const payment = await withCircuit("mercadopago", () =>
          paymentClient.get({ id: paymentId }),
        )
        paidAt = parseMercadoPagoPaidAt(
          payment.date_approved ?? payment.date_created ?? null,
        )
      }

      if (!isWithinMercadoPagoRefundWindow(paidAt)) {
        logger.error({
          context: "mercadopago/refund-service",
          message: "refund_window_expired",
          paymentId,
          paidAt: paidAt?.toISOString() ?? null,
          reason: input.reason ?? null,
        })
        return {
          success: false,
          paymentId,
          mode,
          error: "refund_window_expired",
        }
      }

      const refunds = new PaymentRefund(client)
      const response = await withCircuit("mercadopago", () =>
        refunds.total({
          payment_id: paymentId,
        }),
      )

      const envelope = response as {
        id?: string | number
        api_response?: { status?: number }
      }
      const httpStatus = envelope.api_response?.status
      if (
        typeof httpStatus === "number" &&
        httpStatus !== 200 &&
        httpStatus !== 201
      ) {
        return {
          success: false,
          paymentId,
          mode,
          error: `mp_refund_http_${httpStatus}`,
        }
      }

      return {
        success: true,
        paymentId,
        mode,
        refundId: envelope.id != null ? String(envelope.id) : null,
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
