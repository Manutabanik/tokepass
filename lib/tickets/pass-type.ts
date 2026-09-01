export const TICKET_PASS_TYPES = ["admission", "parking", "access_pass"] as const

export type TicketPassType = (typeof TICKET_PASS_TYPES)[number]

export function resolveTicketPassType(input: {
  tierType?: string | null
  ticketType?: string | null
  category?: string | null
  name?: string | null
}): TicketPassType {
  const tier = String(input.tierType ?? "").trim().toLowerCase()
  const kind = String(input.ticketType ?? "").trim().toLowerCase()
  const category = String(input.category ?? "").trim().toLowerCase()
  const name = String(input.name ?? "").trim().toLowerCase()

  if (
    kind === "parking" ||
    category === "parking" ||
    /\b(estacionamiento|parking|cochera)\b/.test(name)
  ) {
    return "parking"
  }

  if (
    tier === "addon" ||
    kind === "extra" ||
    kind === "access_pass" ||
    category === "special" ||
    category === "addon" ||
    category === "access_pass"
  ) {
    return "access_pass"
  }

  return "admission"
}
