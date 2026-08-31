export type TicketSeatSource = {
  seatingLabel?: string | null
  seatingRowLabel?: string | null
  seatingLayoutType?: "table_combo" | "numbered_seat" | null
  tierName?: string | null
}

function sameSeatText(left: string, right: string): boolean {
  return left.trim().toLocaleUpperCase("es-AR") === right.trim().toLocaleUpperCase("es-AR")
}

function includesLoose(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase("es-AR").includes(needle.toLocaleLowerCase("es-AR"))
}

function formatRowLabel(row: string): string {
  return /^fila\b/i.test(row) ? row : `Fila ${row}`
}

/**
 * Exact map place (Mesa 01, Fila 3 - Asiento 12).
 * Ignores sector-only labels that merely repeat the ticket tier.
 */
export function ticketExactSeatLabel(ticket: TicketSeatSource): string | null {
  const place = ticket.seatingLabel?.trim() || ""
  const rowRaw = ticket.seatingRowLabel?.trim() || ""
  const tier = ticket.tierName?.trim() || ""

  if (!place && !rowRaw) return null
  if (place && !rowRaw && tier && sameSeatText(place, tier)) return null

  if (ticket.seatingLayoutType === "numbered_seat" && rowRaw && place) {
    if (includesLoose(place, rowRaw)) return place
    const seat = /\b(asiento|mesa|silla|butaca)\b/i.test(place)
      ? place
      : `Asiento ${place}`
    return `${formatRowLabel(rowRaw)} - ${seat}`
  }

  if (rowRaw && place && !includesLoose(place, rowRaw) && !sameSeatText(place, rowRaw)) {
    return `${formatRowLabel(rowRaw)} - ${place}`
  }

  return place || formatRowLabel(rowRaw)
}

export function ticketOrdinalLabel(
  tierName: string,
  index: number,
  total: number,
  seatLabel?: string | null,
): string {
  const name = tierName.trim() || "Entrada"
  const seat = seatLabel?.trim() || ""
  if (seat) return `${name} - ${seat}`
  if (total <= 1) return name
  return `${name} - Entrada ${index + 1} de ${total}`
}

export function ticketAdmissionTitle(
  ticket: TicketSeatSource & { tierName: string },
  index = 0,
  total = 1,
): string {
  return ticketOrdinalLabel(
    ticket.tierName,
    index,
    total,
    ticketExactSeatLabel(ticket),
  )
}

export function ticketOrdinalInGroup<
  T extends { id: string; tierName: string } & TicketSeatSource,
>(tickets: T[], ticket: T): { index: number; total: number; label: string } {
  const sameTier = tickets.filter((item) => item.tierName === ticket.tierName)
  const index = Math.max(0, sameTier.findIndex((item) => item.id === ticket.id))
  const total = sameTier.length
  return {
    index,
    total,
    label: ticketAdmissionTitle(ticket, index, total),
  }
}
