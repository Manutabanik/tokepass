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

export type WalletExtraGroupable = {
  id: string
  orderId?: string | null
  productKey: string
  title: string
}

export type WalletExtraBundle<T extends WalletExtraGroupable = WalletExtraGroupable> = {
  id: string
  title: string
  count: number
  items: T[]
}

export function walletExtraBundleKey(unit: WalletExtraGroupable): string {
  const product = unit.productKey.trim() || `unit:${unit.id}`
  const order = unit.orderId?.trim()
  return order ? `ord:${order}:${product}` : `unit:${unit.id}`
}

export function walletExtraBundleTitle(name: string, count: number): string {
  const label = name.trim() || "Extra"
  if (count <= 1) return label
  return `${label} (x${count})`
}

export function groupWalletExtraUnits<T extends WalletExtraGroupable>(
  units: readonly T[],
): WalletExtraBundle<T>[] {
  const buckets = new Map<string, T[]>()
  for (const unit of units) {
    const key = walletExtraBundleKey(unit)
    const list = buckets.get(key)
    if (list) list.push(unit)
    else buckets.set(key, [unit])
  }

  return [...buckets.entries()].map(([id, items]) => ({
    id,
    title: walletExtraBundleTitle(items[0]?.title ?? "Extra", items.length),
    count: items.length,
    items,
  }))
}
