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

/** Drafts used to store free text. Map known phrases onto the live enum. */
export function parseDraftRefundPolicy(value: unknown): EventRefundPolicy {
  if (typeof value === "string") {
    const text = value.trim().toLowerCase()
    if (!text) return "organizer"
    if (text === "no_refunds" || /sin devoluci/.test(text)) return "no_refunds"
    if (text === "until_24h" || /24\s*h/.test(text)) return "until_24h"
    if (text === "organizer" || /criterio/.test(text)) return "organizer"
  }
  return parseEventRefundPolicy(value)
}
