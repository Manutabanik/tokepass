import {
  asHoldEventDateId,
  storefrontSelectionKey,
} from "@/lib/checkout/seat-hold-day"
import {
  mappedCheckoutItemFromStorefrontPlace,
} from "@/lib/checkout/storefront-checkout-items"
import type { CheckoutCartItemInput } from "@/lib/validations/checkout"

export type MappedCartPlace = {
  id: string
  ticketTierId?: string | null
  sectorId?: string | null
  tableNumber?: number | null
  seatingUnitId?: string | null
  eventDateId?: string | null
}

export function mappedLineDedupKey(line: {
  seatingUnitId?: string | null
  seat_id?: string | null
  element_id?: string | null
  elementId?: string | null
  eventDateId?: string | null
  event_date_id?: string | null
}): string {
  return storefrontSelectionKey({
    id: line.seatingUnitId || line.seat_id || line.element_id || line.elementId,
    eventDateId: line.eventDateId ?? line.event_date_id,
  })
}

/**
 * Build mapped checkout lines. On multi-day events a place without a jornada
 * is dropped instead of being stamped with the active tab (wrong-day sale).
 */
export function collectMappedCheckoutLines(input: {
  places: MappedCartPlace[]
  selectedDateId?: string | null
  scheduleDayCount: number
}): CheckoutCartItemInput[] {
  const multiDay = input.scheduleDayCount >= 2
  const seated = new Map<string, CheckoutCartItemInput>()

  for (const place of input.places) {
    const ticketTierId = place.ticketTierId?.trim()
    if (!ticketTierId) continue
    const ownDate = asHoldEventDateId(place.eventDateId)
    const tabDate = asHoldEventDateId(input.selectedDateId)
    const eventDateId = ownDate ?? (multiDay ? null : tabDate)
    if (multiDay && !eventDateId) continue
    const line = mappedCheckoutItemFromStorefrontPlace({
      id: place.id,
      ticketTierId,
      sectorId: place.sectorId,
      tableNumber: place.tableNumber,
      seatingUnitId: place.seatingUnitId,
      eventDateId,
    })
    if (!line) continue
    const key = mappedLineDedupKey(line)
    if (seated.has(key)) continue
    seated.set(key, line)
  }

  return [...seated.values()]
}
