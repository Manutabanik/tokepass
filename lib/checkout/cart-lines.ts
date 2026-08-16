export const CART_TICKET_LINE_PREFIX = "ticket:"

export function cartTicketLineId(tierId: string, dateId?: string | null) {
  return `${CART_TICKET_LINE_PREFIX}${tierId}__${dateId ?? "all"}`
}

export function parseCartTicketLineId(id: string): string | null {
  if (!id.startsWith(CART_TICKET_LINE_PREFIX)) return null
  const rest = id.slice(CART_TICKET_LINE_PREFIX.length)
  const sep = rest.indexOf("__")
  return sep === -1 ? rest : rest.slice(0, sep)
}
