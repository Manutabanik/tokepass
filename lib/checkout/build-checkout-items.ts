import type { CheckoutCartItemInput } from "@/lib/validations/checkout"
import { sanitizeCheckoutActionItems } from "@/lib/checkout/cart-item-payload"
import {
  generalLineTierId,
  isMapCartLine,
  type CartIdentityLine,
} from "@/lib/checkout/cart-item-identity"
import { cartItemScheduleId } from "@/lib/checkout/cart-line-stamp"
import { cartLineQuantity } from "@/lib/checkout/cart-lines"
import {
  collectMappedCheckoutLines,
  type MappedCartPlace,
} from "@/lib/checkout/mapped-cart-lines"

export function placesFromCartLines(
  lines: readonly CartIdentityLine[],
): MappedCartPlace[] {
  const places: MappedCartPlace[] = []
  for (const line of lines) {
    if (!isMapCartLine(line)) continue
    const unitId = line.seatId?.trim() || ""
    const elementId = line.elementId?.trim() || unitId
    const ticketTierId = generalLineTierId(line)
    if (!elementId || !ticketTierId) continue
    places.push({
      id: elementId,
      ticketTierId,
      sectorId: line.sectorId,
      seatingUnitId: unitId || null,
      eventDateId: cartItemScheduleId(line),
    })
  }
  return places
}

export function generalItemsFromCartLines(
  lines: readonly CartIdentityLine[],
  mapBackedTierIds: ReadonlySet<string>,
): CheckoutCartItemInput[] {
  return lines
    .filter((line) => {
      if (isMapCartLine(line)) return false
      const tierId = generalLineTierId(line)
      if (!tierId || mapBackedTierIds.has(tierId)) return false
      return cartLineQuantity(line.quantity) > 0
    })
    .map((line) => {
      const tierId = generalLineTierId(line)
      const dateId = cartItemScheduleId(line)
      return {
        type: "general" as const,
        ticket_type_id: tierId,
        ticket_tier_id: tierId,
        ticketTierId: tierId,
        tierId,
        quantity: cartLineQuantity(line.quantity),
        sector_id: line.sectorId ?? undefined,
        sectorKey: line.sectorId ?? null,
        has_map: Boolean(line.sectorId),
        is_numbered: false,
        hasMap: Boolean(line.sectorId),
        isNumbered: false,
        isMappedSelection: false,
        is_mapped_selection: false,
        eventDateId: dateId,
        event_date_id: dateId,
        dateId,
      }
    })
}

/**
 * Leftover map/combo places must not ride along a GA-only cart.
 * Only fill seating refs for SKUs already present as map lines.
 */
export function extraPlacesForCheckoutLock(
  lines: readonly CartIdentityLine[],
  places: readonly MappedCartPlace[] = [],
): MappedCartPlace[] {
  const mappedTiers = new Set(
    lines
      .filter((line) => isMapCartLine(line))
      .map((line) => generalLineTierId(line))
      .filter(Boolean),
  )
  if (mappedTiers.size === 0) return []
  return places.filter((place) => {
    const tier = place.ticketTierId?.trim()
    return Boolean(tier && mappedTiers.has(tier))
  })
}

export function buildCheckoutActionItems(input: {
  lines: readonly CartIdentityLine[]
  extraPlaces?: MappedCartPlace[]
  selectedDateId?: string | null
  scheduleDayCount: number
  mapBackedTierIds?: Iterable<string>
  extraAddonId?: string
}): CheckoutCartItemInput[] {
  const mapBacked = new Set(input.mapBackedTierIds ?? [])
  const seated = collectMappedCheckoutLines({
    places: [...placesFromCartLines(input.lines), ...(input.extraPlaces ?? [])],
    selectedDateId: input.selectedDateId,
    scheduleDayCount: input.scheduleDayCount,
  })
  for (const line of seated) {
    const id = line.tierId || line.ticketTierId || line.ticket_tier_id
    if (id) mapBacked.add(id)
  }
  const items: CheckoutCartItemInput[] = [
    ...seated,
    ...generalItemsFromCartLines(input.lines, mapBacked),
  ]
  if (input.extraAddonId) {
    const existing = items.find((item) => item.tierId === input.extraAddonId)
    if (existing) {
      existing.quantity += 1
    } else {
      items.push({
        type: "general",
        ticket_type_id: input.extraAddonId,
        ticket_tier_id: input.extraAddonId,
        ticketTierId: input.extraAddonId,
        tierId: input.extraAddonId,
        quantity: 1,
        sectorKey: null,
        has_map: false,
        is_numbered: false,
        hasMap: false,
        isNumbered: false,
        isMappedSelection: false,
        is_mapped_selection: false,
        eventDateId: null,
        event_date_id: null,
        dateId: null,
      })
    }
  }
  return sanitizeCheckoutActionItems(items)
}
