import { mapGatewayPaymentStatus } from "@/lib/payments/core/map-gateway-status"

export type OrphanReconcileAction = "finalize" | "keep" | "release"

export type OrphanGatewayPayment = {
  id: string
  status: string | null | undefined
  amount: number
  currency?: string | null
  raw?: unknown
}

/**
 * Zero-trust: un hold con intento de pago no se libera por TTL local.
 * Primero se mira el estado real de la pasarela.
 */
export function decideOrphanPaymentAction(
  payments: readonly OrphanGatewayPayment[],
): {
  action: OrphanReconcileAction
  payment?: OrphanGatewayPayment
} {
  const approved = payments.find(
    (payment) => mapGatewayPaymentStatus(payment.status) === "approved",
  )
  if (approved) return { action: "finalize", payment: approved }

  const inFlight = payments.find((payment) => {
    const status = mapGatewayPaymentStatus(payment.status)
    return status === "pending" || status === "in_mediation"
  })
  if (inFlight) return { action: "keep", payment: inFlight }

  if (payments.length === 0) return { action: "keep" }

  return { action: "release", payment: payments[0] }
}
