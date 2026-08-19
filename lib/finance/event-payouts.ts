import type { EventPayoutStatus } from "@/types/database"

export const EVENT_PAYOUT_STATUS_LABEL: Record<EventPayoutStatus, string> = {
  hold: "Retenido",
  pending_approval: "Pendiente de aprobación",
  processing: "En proceso",
  completed: "Liquidado",
  cancelled: "Cancelado",
}

export const BANK_VERIFICATION_LABEL = {
  unverified: "Sin verificar",
  pending_review: "En revisión",
  verified: "Verificado",
  rejected: "Rechazado",
} as const
