import "server-only"

import { PaymentRefund } from "mercadopago"

import { getMercadoPagoClient } from "@/lib/mercadopago"
import { isMercadoPagoAlreadyRefundedError } from "@/lib/payments/mercadopago/refund-expired-payment-errors"
import { withCircuit } from "@/lib/resilience/circuit-breaker"

/**
 * Reembolso total del cobro MP cuando no se puede emitir el ticket.
 * Lo usan el webhook/IPN y la conciliación de huérfanos.
 */
export async function refundExpiredPayment(mpPaymentId: string): Promise<void> {
  const client = getMercadoPagoClient()
  const refunds = new PaymentRefund(client)
  try {
    await withCircuit("mercadopago", () =>
      refunds.total({ payment_id: mpPaymentId }),
    )
  } catch (error) {
    if (isMercadoPagoAlreadyRefundedError(error)) return
    throw error
  }
}
