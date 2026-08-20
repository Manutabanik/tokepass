export type OfflineFlushTicket = {
  id: string
  pending_transfer?: boolean | null
  listed_for_resale?: boolean | null
  status?: string | null
}

export function selectOfflineScansReadyToFlush<
  T extends { ticket_id: string },
>(queue: readonly T[], tickets: readonly (OfflineFlushTicket | null)[]): T[] {
  const byId = new Map<string, OfflineFlushTicket>()
  for (const ticket of tickets) {
    if (!ticket?.id) continue
    byId.set(ticket.id, ticket)
  }

  return queue.filter((item) => {
    const ticket = byId.get(item.ticket_id)
    if (!ticket) return false
    if (ticket.pending_transfer) return false
    if (ticket.listed_for_resale) return false
    const status = String(ticket.status ?? "").trim().toLowerCase()
    if (
      status === "transferred" ||
      status === "cancelled" ||
      status === "pending_payment"
    ) {
      return false
    }
    return true
  })
}
