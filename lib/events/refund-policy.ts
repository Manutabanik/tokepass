import {
  parseEventRefundPolicy,
  type EventRefundPolicy,
} from "@/lib/validations/event-form"

export type { EventRefundPolicy }

export const REFUND_POLICY_COPY: Record<
  EventRefundPolicy,
  { label: string; buyer: string; hint: string }
> = {
  organizer: {
    label: "A criterio del organizador",
    hint: "Las devoluciones se resuelven caso por caso.",
    buyer:
      "Las devoluciones se resuelven caso por caso con el organizador. Si el evento se cancela, TokePass gestiona el reintegro según el estado del pago.",
  },
  no_refunds: {
    label: "Sin devoluciones",
    hint: "Salvo cancelación del evento.",
    buyer:
      "Este evento no admite devoluciones, salvo que se cancele. En ese caso TokePass gestiona el reintegro según el estado del pago.",
  },
  until_24h: {
    label: "Hasta 24 h antes",
    hint: "Después de ese plazo no hay reembolso.",
    buyer:
      "Podés pedir la devolución hasta 24 horas antes del inicio. Después de ese plazo no hay reembolso, salvo cancelación del evento.",
  },
}

export const REFUND_POLICY_OPTIONS = (
  Object.keys(REFUND_POLICY_COPY) as EventRefundPolicy[]
).map((value) => ({
  value,
  label: REFUND_POLICY_COPY[value].label,
  hint: REFUND_POLICY_COPY[value].hint,
}))

export function refundPolicyBuyerCopy(value: unknown): string {
  return REFUND_POLICY_COPY[parseEventRefundPolicy(value)].buyer
}
