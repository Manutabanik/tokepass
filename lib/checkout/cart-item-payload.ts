import type { CheckoutCartItemInput } from "@/lib/validations/checkout"

/** Identifiers + quantity only. Client money never belongs on this payload. */
export type CartItemPayload = {
  ticket_type_id?: string
  sector_id?: string
  seat_id?: string
  quantity: number
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }
  return undefined
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {}
}

export function toCartItemPayload(input: unknown): CartItemPayload {
  const item = asRecord(input)
  const ticketId = firstNonEmpty(
    item.ticket_type_id,
    item.ticketTypeId,
    item.ticket_tier_id,
    item.ticketTierId,
    item.tierId,
  )
  const sectorId = firstNonEmpty(item.sector_id, item.sectorId, item.sectorKey)
  const seatId = firstNonEmpty(
    item.seat_id,
    item.seatId,
    item.seatingUnitId,
    Array.isArray(item.seatingIds) ? item.seatingIds[0] : undefined,
  )
  const quantityRaw = Number(item.quantity)
  const payload: CartItemPayload = {
    quantity: Number.isFinite(quantityRaw)
      ? Math.max(0, Math.floor(quantityRaw))
      : 0,
  }
  if (ticketId) payload.ticket_type_id = ticketId
  if (sectorId) payload.sector_id = sectorId
  if (seatId) payload.seat_id = seatId
  return payload
}

function asOptionalBoolean(
  ...values: unknown[]
): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value
  }
  return undefined
}

/**
 * Expand the exclusive cart payload into the current checkout action shape.
 * Drops price / total / unit_price. Keeps only ids, quantity, and seating refs.
 */
export function sanitizeCheckoutActionItem(
  input: unknown,
): CheckoutCartItemInput {
  const item = asRecord(input)
  const payload = toCartItemPayload(item)
  const ticketId = payload.ticket_type_id
  const seatId = payload.seat_id
  const elementId = firstNonEmpty(item.element_id, item.elementId)
  const explicitType =
    typeof item.type === "string" ? item.type.trim() : undefined
  const isMapped =
    explicitType === "mapped" || Boolean(seatId) || Boolean(elementId)
  const quantityRaw = payload.quantity
  const quantity =
    Number.isFinite(quantityRaw) && quantityRaw > 0
      ? quantityRaw
      : isMapped
        ? 1
        : quantityRaw
  const hasMap = asOptionalBoolean(item.hasMap, item.has_map)
  const isNumbered = asOptionalBoolean(item.isNumbered, item.is_numbered)
  const isMappedSelection = asOptionalBoolean(
    item.isMappedSelection,
    item.is_mapped_selection,
  )

  return {
    type: isMapped ? "mapped" : "general",
    ticket_type_id: ticketId,
    ticket_tier_id: ticketId,
    ticketTierId: ticketId,
    tierId: ticketId,
    quantity,
    sector_id: payload.sector_id,
    sectorKey: payload.sector_id ?? null,
    seat_id: seatId,
    seatId,
    seatingUnitId: seatId,
    element_id: elementId,
    elementId,
    tableNumber:
      typeof item.tableNumber === "number" ? item.tableNumber : null,
    zoneId: firstNonEmpty(item.zoneId, item.zone_id) ?? null,
    hasMap,
    has_map: hasMap,
    isNumbered,
    is_numbered: isNumbered,
    isMappedSelection,
    is_mapped_selection: isMappedSelection,
  }
}

export function sanitizeCheckoutActionItems(
  items: readonly unknown[],
): CheckoutCartItemInput[] {
  return items.map((item) => sanitizeCheckoutActionItem(item))
}
