import type { MyTicket } from "@/app/actions/tickets"

export function splitTicketsBySchedule(tickets: MyTicket[]): {
  upcoming: MyTicket[]
  past: MyTicket[]
} {
  const now = Date.now()

  const upcoming: MyTicket[] = []
  const past: MyTicket[] = []

  for (const ticket of tickets) {
    const eventMs = new Date(ticket.eventDate).getTime()
    const isPastEvent = Number.isFinite(eventMs) && eventMs < now
    const isActive = ticket.status === "valid"

    if (isPastEvent || !isActive) {
      past.push(ticket)
    } else {
      upcoming.push(ticket)
    }
  }

  past.sort(
    (a, b) =>
      new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
  )

  return { upcoming, past }
}

/** Solo `valid` de eventos futuros (hub / contador de billetera). */
export function countActiveTickets(tickets: MyTicket[]): number {
  return splitTicketsBySchedule(tickets).upcoming.length
}
