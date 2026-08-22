import { HIGH_DEMAND_LOCK_TIMEOUT } from "@/lib/checkout/lock-timeout"
import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"

export const SECTOR_NOT_CONFIGURED = "SECTOR_NOT_CONFIGURED"
export const SECTOR_NOT_CONFIGURED_MESSAGE =
  "Esta ubicación no está disponible temporalmente por mantenimiento"

export const SEAT_SELECTION_REQUIRED = "SEAT_SELECTION_REQUIRED"
export const SEAT_SELECTION_REQUIRED_MESSAGE =
  "Debes seleccionar un asiento o mesa en el mapa antes de continuar."

export const SEAT_UNAVAILABLE = "SEAT_UNAVAILABLE"
export const SEAT_UNAVAILABLE_MESSAGE =
  "La mesa elegida acaba de ser reservada por otro comprador. Por favor, selecciona otra en el mapa."

export const GENERAL_STOCK_UNAVAILABLE = "GENERAL_STOCK_UNAVAILABLE"
export const ERR_NO_STOCK = "ERR_NO_STOCK"
export const ERR_SEAT_TAKEN = "ERR_SEAT_TAKEN"

const STOCK_ERROR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function generalStockUnavailableMessage(name?: string | null): string {
  const label = name?.trim()
  return label
    ? `No hay suficiente stock disponible para ${label}.`
    : "No hay suficiente stock disponible para este adicional."
}

export function encodeGeneralStockUnavailable(
  name?: string | null,
  ticketId?: string | null,
): string {
  const id = ticketId?.trim() || ""
  const label = name?.trim() || ""
  if (id && label) return `${ERR_NO_STOCK}:${id}:${label}`
  if (id) return `${ERR_NO_STOCK}:${id}`
  if (label) return `${GENERAL_STOCK_UNAVAILABLE}:${label}`
  return ERR_NO_STOCK
}

export function parseGeneralStockParts(error: string): {
  ticketId?: string
  name?: string
} | null {
  const normalized = error.trim()
  if (!normalized) return null
  const upper = normalized.toUpperCase()
  const prefixes = [ERR_NO_STOCK, GENERAL_STOCK_UNAVAILABLE] as const
  const prefix = prefixes.find((item) => upper === item || upper.startsWith(`${item}:`))
  if (!prefix) return null
  if (upper === prefix) return {}
  const rest = normalized.slice(prefix.length + 1)
  if (!rest) return {}
  const colon = rest.indexOf(":")
  const first = colon === -1 ? rest : rest.slice(0, colon)
  const second = colon === -1 ? "" : rest.slice(colon + 1)
  if (STOCK_ERROR_UUID.test(first)) {
    return { ticketId: first, name: second.trim() || undefined }
  }
  return { name: rest.trim() || undefined }
}

export function parseGeneralStockUnavailable(
  error: string,
): string | null {
  const parts = parseGeneralStockParts(error)
  if (!parts) return null
  return generalStockUnavailableMessage(parts.name)
}

export function isSeatUnavailableError(error: string): boolean {
  const normalized = error.trim()
  if (!normalized) return false
  if (normalized === SEAT_UNAVAILABLE || normalized === ERR_SEAT_TAKEN) return true
  if (normalized === SEAT_UNAVAILABLE_MESSAGE) return true
  return /seating_unit_unavailable|seat_unavailable/i.test(normalized)
}

export function isGeneralStockUnavailableError(error: string): boolean {
  return parseGeneralStockUnavailable(error) != null
}

export function layoutRequiresSeatSelection(
  layoutType: string | null | undefined,
): boolean {
  return layoutType === "numbered_seat" || layoutType === "table_combo"
}

export function isSeatSelectionRequiredError(error: string): boolean {
  const normalized = error.trim()
  if (!normalized) return false
  if (normalized === SEAT_SELECTION_REQUIRED) return true
  if (normalized === SEAT_SELECTION_REQUIRED_MESSAGE) return true
  return /debes seleccionar un asiento o mesa/i.test(normalized)
}

export function isSectorNotConfiguredError(error: string): boolean {
  const normalized = error.trim()
  if (!normalized) return false
  if (normalized === SECTOR_NOT_CONFIGURED) return true
  return /sector_not_configured|seating_sector_empty|seating_sector_not_found|seating_layout_not_found|seating_unit_not_materialized/i.test(
    normalized,
  )
}

export function isCheckoutConnectionNoise(error: string): boolean {
  return /revisá tu conexión|conexi[oó]n a internet|no pudimos guardar los cambios|no pudimos actualizar las entradas/i.test(
    error,
  )
}

export function isBuyerSoldOutToast(error: string): boolean {
  const normalized = error.trim().toLowerCase()
  if (!normalized) return false
  if (isSectorNotConfiguredError(error)) return false
  if (isSeatSelectionRequiredError(error)) return false
  if (isSeatUnavailableError(error)) return false
  if (isGeneralStockUnavailableError(error)) return false
  if (isCheckoutConnectionNoise(error)) return false
  if (normalized === "out_of_stock" || normalized === "conflict") return true
  return /agotad|sold out|out_of_stock|sin stock|stock insuficiente/.test(
    normalized,
  )
}

export function isCheckoutStockConflict(error: string): boolean {
  if (error === HIGH_DEMAND_LOCK_TIMEOUT) return false
  if (isSectorNotConfiguredError(error)) return false
  if (isSeatSelectionRequiredError(error)) return false
  if (isSeatUnavailableError(error)) return false
  if (isGeneralStockUnavailableError(error)) return false
  if (isCheckoutConnectionNoise(error)) return false
  const normalized = error.toLowerCase()
  return (
    error === "out_of_stock" ||
    error === "conflict" ||
    normalized.includes("409") ||
    normalized.includes("conflict") ||
    normalized.includes("sold out") ||
    normalized.includes("stock") ||
    normalized.includes("agotad") ||
    normalized.includes("capacidad") ||
    normalized.includes("seating_unit_unavailable") ||
    normalized.includes("already taken") ||
    normalized.includes("recinto") ||
    normalized.includes("asiento") ||
    normalized.includes("ubicaci")
  )
}

export type CartHoldRow = {
  hold_kind: string
  tier_id: string
  quantity: number
  seating_unit_id?: string | null
  layout_item_id?: string | null
  label?: string | null
  reserved_until: string
}

export function filterSelectedItemsByHolds(
  items: StorefrontSelectedItem[],
  holds: readonly CartHoldRow[],
): StorefrontSelectedItem[] {
  const seatIds = new Set<string>()
  for (const hold of holds) {
    if (hold.hold_kind !== "seat") continue
    if (hold.seating_unit_id) seatIds.add(hold.seating_unit_id)
    if (hold.layout_item_id) seatIds.add(hold.layout_item_id)
  }

  return items.filter((item) => {
    if (item.type === "zone" || item.type === "standing") return true
    if (seatIds.size === 0) return false
    return seatIds.has(item.id)
  })
}

export function rehydrateSelectedItemsFromHolds(input: {
  items: StorefrontSelectedItem[]
  holds: readonly CartHoldRow[]
  source: "server" | "unavailable"
  resolveHoldItem?: (hold: CartHoldRow) => StorefrontSelectedItem | null
}): StorefrontSelectedItem[] {
  if (input.source === "unavailable") return input.items

  const seatHolds = input.holds.filter((hold) => hold.hold_kind === "seat")
  const holdIds = new Set<string>()
  for (const hold of seatHolds) {
    if (hold.seating_unit_id) holdIds.add(hold.seating_unit_id)
    if (hold.layout_item_id) holdIds.add(hold.layout_item_id)
  }

  const kept = input.items.filter((item) => {
    if (item.type === "zone" || item.type === "standing") return true
    return holdIds.has(item.id)
  })
  const seen = new Set(kept.map((item) => item.id))

  for (const hold of seatHolds) {
    const candidates = [hold.layout_item_id, hold.seating_unit_id].filter(
      (id): id is string => Boolean(id),
    )
    if (candidates.some((id) => seen.has(id))) continue
    const resolved = input.resolveHoldItem?.(hold)
    if (!resolved) continue
    kept.push(resolved)
    seen.add(resolved.id)
  }

  return kept
}

export function earliestHoldExpiry(holds: readonly CartHoldRow[]): string | null {
  let min: string | null = null
  for (const hold of holds) {
    if (!hold.reserved_until) continue
    if (!min || hold.reserved_until < min) min = hold.reserved_until
  }
  return min
}
