export function ticketOrdinalLabel(
  tierName: string,
  index: number,
  total: number,
): string {
  const name = tierName.trim() || "Entrada"
  if (total <= 1) return name
  return `${name} - Entrada ${index + 1} de ${total}`
}

export function ticketOrdinalInGroup<T extends { id: string; tierName: string }>(
  tickets: T[],
  ticket: T,
): { index: number; total: number; label: string } {
  const sameTier = tickets.filter((item) => item.tierName === ticket.tierName)
  const index = Math.max(0, sameTier.findIndex((item) => item.id === ticket.id))
  const total = sameTier.length
  return {
    index,
    total,
    label: ticketOrdinalLabel(ticket.tierName, index, total),
  }
}
