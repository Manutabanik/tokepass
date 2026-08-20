export type TicketVisualStatus = "active" | "transfer_pending" | "resale_pending"

export function resolveTicketVisualStatus(ticket: {
  pendingTransfer: unknown
  activeResaleListingId: string | null
}): TicketVisualStatus {
  if (ticket.pendingTransfer) return "transfer_pending"
  if (ticket.activeResaleListingId) return "resale_pending"
  return "active"
}
