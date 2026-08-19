import type { MyTicket } from "@/app/actions/tickets"

export function ticketSectorLabel(ticket: {
  seatingSectorName?: string | null
  seatingLabel?: string | null
  tierName: string
}): string {
  const sector = ticket.seatingSectorName?.trim()
  if (sector) return sector.toUpperCase()
  return ticket.tierName.trim().toUpperCase() || "GENERAL"
}

export function ticketVenueLine(ticket: Pick<MyTicket, "venueName" | "eventLocation">) {
  if (ticket.venueName && ticket.venueName !== ticket.eventLocation) {
    return `${ticket.venueName} · ${ticket.eventLocation}`
  }
  return ticket.venueName || ticket.eventLocation
}
