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
  const location = ticket.eventLocation?.trim() || ""
  if (ticket.venueName && ticket.venueName !== location) {
    return location ? `${ticket.venueName} · ${location}` : ticket.venueName
  }
  return ticket.venueName || location || "Online"
}
