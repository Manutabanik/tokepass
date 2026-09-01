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
 * Zero-trust sobre el gateway, no sobre un hold eterno:
 * - approved → confirmar
 * - pending / in_mediation → keep (el cron igual corta a los 15m)
 * - búsqueda OK sin pagos (preferencia abandonada) → release
 * - rejected / cancelled → release
 * Si la búsqueda a MP falla, el caller no invoca esto (keep).
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

  if (payments.length === 0) return { action: "release" }

  return { action: "release", payment: payments[0] }
}
