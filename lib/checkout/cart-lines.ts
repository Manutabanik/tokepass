import { isValidPublicPrice } from "@/lib/checkout/public-price"
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

export function cartPlaceLabel(item: {
  type?: string | null
  inventoryType?: string | null
  name?: string | null
  displayName?: string | null
  row?: string | null
  number?: number | null
}): string {
  const isTable =
    item.type === "table" || item.inventoryType === "TABLES"
  if (isTable) {
    const n =
      typeof item.number === "number" && Number.isFinite(item.number)
        ? Math.floor(item.number)
        : null
    if (n && n > 0) return `Mesa ${String(n).padStart(2, "0")}`
    const match = `${item.displayName ?? ""} ${item.name ?? ""}`.match(
      /mesa\s*0*(\d+)/i,
    )
    if (match?.[1]) return `Mesa ${match[1].padStart(2, "0")}`
    return ""
  }
  const row = item.row?.trim() ?? ""
  const n =
    typeof item.number === "number" && Number.isFinite(item.number)
      ? Math.floor(item.number)
      : null
  if (row && n && n > 0) return `Fila ${row} - Asiento ${n}`
  if (n && n > 0) return `Asiento ${n}`
  return ""
}

export function cartLineSeatTitle(line: {
  name: string
  displayName?: string | null
  sectorName?: string | null
  seatLabel?: string | null
  placeLabel?: string | null
}): string {
  const ticket =
    line.displayName?.trim() ||
    line.sectorName?.trim() ||
    line.name.trim()
  const seat = (line.seatLabel ?? line.placeLabel)?.trim() || ""
  if (seat && seat !== ticket && !ticket.includes(seat)) {
    return `${ticket} - ${seat}`
  }
  return ticket
}

/**
 * Qty 1: ticket name (+ seat). Qty > 1: `2x Name — $1.000 c/u`.
 * Never append the active tab date; only stamped seat/name fields.
 */
export function cartLinePrimaryLabel(line: {
  quantity?: number
  name: string
  displayName?: string | null
  sectorName?: string | null
  seatLabel?: string | null
  placeLabel?: string | null
  unitPriceLabel?: string | null
}): string {
  const qty = cartLineQuantity(line.quantity)
  const title = cartLineSeatTitle(line)
  if (qty <= 1) return title
  const unit = line.unitPriceLabel?.trim()
  return unit ? `${qty}x ${title} — ${unit} c/u` : `${qty}x ${title}`
}

/**
 * Desglose inmutable: `Nombre - seatLabel - dateString`.
 * Only stamped fields. No active tab. Omit seat dash when there is no seatLabel.
 */
export function cartLineSnapshotLabel(line: {
  name: string
  displayName?: string | null
  seatLabel?: string | null
  dateString?: string | null
}): string {
  const ticket = line.displayName?.trim() || line.name.trim()
  const seat = line.seatLabel?.trim() || ""
  const date = line.dateString?.trim() || ""
  const parts = [ticket]
  if (seat && seat !== ticket && !ticket.includes(seat)) parts.push(seat)
  if (date && !parts.some((part) => part.includes(date))) parts.push(date)
  return parts.filter(Boolean).join(" - ")
}

export function cartLineBreakdownLabel(line: {
  quantity?: number
  name: string
  displayName?: string | null
  sectorName?: string | null
  placeLabel?: string | null
  seatLabel?: string | null
  dateLabel?: string | null
  dateString?: string | null
}): string {
  const qty = Math.max(1, Math.floor(Number(line.quantity) || 1))
  const title = cartLineSnapshotLabel({
    name: line.displayName?.trim() || line.sectorName?.trim() || line.name,
    displayName: line.displayName,
    seatLabel: line.seatLabel ?? line.placeLabel,
    dateString: line.dateString ?? line.dateLabel,
  })
  return `${qty}x ${title}`
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
  const day = dateId?.trim() || "all"
  return `${tierId}_${day}`
}

export function parseCartTicketLineId(id: string): string | null {
  if (!id.trim()) return null
  if (id.startsWith(CART_TICKET_LINE_PREFIX)) {
    const rest = id.slice(CART_TICKET_LINE_PREFIX.length)
    const sep = rest.indexOf("__")
    return sep === -1 ? rest : rest.slice(0, sep)
  }
  const sep = id.indexOf("_")
  return sep === -1 ? id : id.slice(0, sep)
}

/** Prefer the stamped line price so a later catalog mix-up cannot change it. */
export function cartLineUnitPrice(
  line: { price: unknown },
  catalog?: { price: unknown } | null,
): number {
  if (isValidPublicPrice(line.price)) return Number(line.price)
  if (catalog && isValidPublicPrice(catalog.price)) return Number(catalog.price)
  return 0
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
