import type { MyTicket } from "@/app/actions/tickets"
import { resolveTicketCommerceType } from "@/lib/events/ticket-commerce-type"
import type { EventItemCategory } from "@/lib/store-categories"

export function isWalletCheckoutExtra(
  ticket: Pick<MyTicket, "ticketType" | "tierType">,
): boolean {
  return (
    resolveTicketCommerceType({
      ticketType: ticket.ticketType,
      tierType: ticket.tierType,
    }) === "extra"
  )
}

export function walletAdmissionTickets<T extends Pick<MyTicket, "ticketType" | "tierType">>(
  tickets: readonly T[],
): T[] {
  return tickets.filter((ticket) => !isWalletCheckoutExtra(ticket))
}

export function walletCheckoutExtras<T extends Pick<MyTicket, "ticketType" | "tierType">>(
  tickets: readonly T[],
): T[] {
  return tickets.filter((ticket) => isWalletCheckoutExtra(ticket))
}

export function inferCheckoutExtraCategory(name: string): EventItemCategory {
  const value = name.trim().toLowerCase()
  if (/\b(cerveza|birra|trago|drink|copa|fernet|gin|vino|barra)\b/.test(value)) {
    return "drinks"
  }
  if (/\b(hamburguesa|comida|food|pizza|taco|empanada)\b/.test(value)) {
    return "food"
  }
  if (/\b(remera|buzo|merch|gorra|sticker)\b/.test(value)) {
    return "merch"
  }
  if (/\b(estacionamiento|parking|cochera)\b/.test(value)) {
    return "parking"
  }
  if (/\b(pase|access|backstage)\b/.test(value)) {
    return "access_pass"
  }
  return "upgrades"
}
