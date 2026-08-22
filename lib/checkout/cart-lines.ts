import { centsToMoney, moneyToCents } from "@/lib/money/cents"

export const CART_TICKET_LINE_PREFIX = "ticket:"

/** Coerce API/state values before any money or quantity math. */
export function toCartNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string" && value.trim() === "") return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function cartLineQuantity(quantity: unknown): number {
  return Math.max(0, Math.floor(toCartNumber(quantity)))
}

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
  price: unknown
  quantity: unknown
}): number {
  const unit = toCartNumber(line.price)
  const quantity = cartLineQuantity(line.quantity)
  if (unit <= 0 || quantity <= 0) return 0
  return centsToMoney(moneyToCents(unit) * quantity)
}
