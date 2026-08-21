import { centsToMoney, moneyToCents } from "@/lib/money/cents"

export const CART_TICKET_LINE_PREFIX = "ticket:"

export function cartLineDisplayName(line: {
  name: string
  displayName?: string | null
  dateLabel?: string | null
}): string {
  const label = line.displayName?.trim() || line.name
  const date = line.dateLabel?.trim()
  if (!date) return label
  const suffix = `(${date})`
  if (label.includes(suffix)) return label
  return `${label} ${suffix}`
}

export function cartTicketLineId(tierId: string, dateId?: string | null) {
  return `${CART_TICKET_LINE_PREFIX}${tierId}__${dateId ?? "all"}`
}

export function parseCartTicketLineId(id: string): string | null {
  if (!id.startsWith(CART_TICKET_LINE_PREFIX)) return null
  const rest = id.slice(CART_TICKET_LINE_PREFIX.length)
  const sep = rest.indexOf("__")
  return sep === -1 ? rest : rest.slice(0, sep)
}

export function cartLineAmount(line: {
  price: number
  quantity: number
}): number {
  const unit = Number(line.price)
  const quantity = Math.max(0, Math.floor(Number(line.quantity)) || 0)
  if (!Number.isFinite(unit) || unit <= 0 || quantity <= 0) return 0
  return centsToMoney(moneyToCents(unit) * quantity)
}
