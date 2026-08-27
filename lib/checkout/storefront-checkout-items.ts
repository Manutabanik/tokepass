import type { CheckoutCartItemInput } from "@/lib/validations/checkout"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isCheckoutUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value))
}

export function storefrontPlaceNeedsMappedLine(type: string): boolean {
  return type === "seat" || type === "table"
}

/**
 * Map a storefront seat/table (often a non-UUID map node like `mesa-09`)
 * to a checkout line the lock/order actions already accept via element_id.
 */
export function mappedCheckoutItemFromStorefrontPlace(input: {
  id: string
  ticketTierId: string
  sectorId?: string | null
  tableNumber?: number | null
  seatingUnitId?: string | null
  eventDateId?: string | null
}): CheckoutCartItemInput | null {
  const elementId = input.id.trim()
  const ticketTierId = input.ticketTierId.trim()
  if (!elementId || !isCheckoutUuid(ticketTierId)) return null
  const unitId =
    input.seatingUnitId && isCheckoutUuid(input.seatingUnitId)
      ? input.seatingUnitId
      : isCheckoutUuid(elementId)
        ? elementId
        : undefined
  const eventDateId =
    input.eventDateId && isCheckoutUuid(input.eventDateId)
      ? input.eventDateId
      : undefined
  return {
    type: "mapped",
    ticket_type_id: ticketTierId,
    ticket_tier_id: ticketTierId,
    ticketTierId,
    tierId: ticketTierId,
    quantity: 1,
    seatingUnitId: unitId,
    seat_id: unitId,
    seatId: unitId,
    element_id: elementId,
    elementId,
    sector_id: input.sectorId ?? undefined,
    sectorKey: input.sectorId ?? null,
    tableNumber: input.tableNumber ?? null,
    has_map: true,
    is_numbered: true,
    hasMap: true,
    isNumbered: true,
    isMappedSelection: true,
    is_mapped_selection: true,
    eventDateId,
    event_date_id: eventDateId,
    dateId: eventDateId,
  }
}
