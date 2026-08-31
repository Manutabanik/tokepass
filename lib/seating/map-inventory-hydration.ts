import { selectableTicketStock } from "@/lib/checkout/ticket-stock"
import { isSoldInventoryStatus } from "@/lib/seating/inventory-seat-state"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { lookupOccupancyStatus } from "@/lib/seating/venue-map-occupancy"
import {
  isSellableElement,
  type InteractiveVenueMap,
  type VenueMapElement,
} from "@/types/venue-map"

export type SoldOutTicketRef = {
  id?: string | null
  available?: number | null
  stock_available?: number | null
  stockAvailable?: number | null
  capacity?: number | null
  sold?: number | null
  seatingSectorId?: string | null
}

function addInventoryId(ids: Set<string>, value?: string | null) {
  const id = value?.trim()
  if (id) ids.add(id)
}

/** Layout ids the canvas can paint — used to lock unknown seats after a live fetch. */
export function collectVenueMapInventoryIds(
  map: Pick<InteractiveVenueMap, "elements" | "sectors"> | null | undefined,
): string[] {
  const ids = new Set<string>()
  for (const element of map?.elements ?? []) {
    if (!isSellableElement(element)) continue
    addInventoryId(ids, element.id)
    for (const seat of element.seats ?? []) addInventoryId(ids, seat.id)
  }
  for (const sector of map?.sectors ?? []) {
    for (const seat of sector.seats ?? []) addInventoryId(ids, seat.id)
  }
  return [...ids]
}

export function soldOutTicketTypeIds(
  tiers: readonly SoldOutTicketRef[],
): string[] {
  const ids = new Set<string>()
  for (const tier of tiers) {
    const hasSignal =
      tier.available != null ||
      tier.stock_available != null ||
      tier.stockAvailable != null ||
      (tier.capacity != null && tier.sold != null)
    if (!hasSignal || selectableTicketStock(tier) > 0) continue
    addInventoryId(ids, tier.id)
    addInventoryId(ids, tier.seatingSectorId)
  }
  return [...ids]
}

function markOccupied(
  occupancy: Record<string, SeatStatus>,
  value?: string | null,
) {
  const id = value?.trim()
  if (id) occupancy[id] = "occupied"
}

function idIsSoldOut(
  sold: Set<string>,
  ...values: Array<string | null | undefined>
) {
  return values.some((value) => {
    const id = value?.trim()
    return Boolean(id && sold.has(id))
  })
}

/**
 * Paints map geometry from ticket-tier stock (ticketTypeId / sector),
 * not only from seating-unit rows. Sold-out SKUs lock every matching place.
 */
export function occupancyFromSoldOutTicketTypes(
  map: InteractiveVenueMap | null | undefined,
  soldOutIds: Iterable<string>,
): Record<string, SeatStatus> {
  const sold = new Set(
    [...soldOutIds].map((id) => id.trim()).filter(Boolean),
  )
  if (!map || sold.size === 0) return {}
  const occupancy: Record<string, SeatStatus> = {}

  for (const element of map.elements ?? []) {
    if (!isSellableElement(element)) continue
    if (
      idIsSoldOut(
        sold,
        element.ticketTypeId,
        element.groupId,
        element.zoneId,
        element.id,
      )
    ) {
      markOccupied(occupancy, element.id)
      for (const seat of element.seats ?? []) markOccupied(occupancy, seat.id)
      continue
    }
    for (const seat of element.seats ?? []) {
      if (idIsSoldOut(sold, seat.ticketTypeId, seat.id)) {
        markOccupied(occupancy, seat.id)
      }
    }
  }

  for (const zone of map.zones ?? []) {
    if (!idIsSoldOut(sold, zone.id)) continue
    markOccupied(occupancy, zone.id)
    for (const element of map.elements ?? []) {
      if (
        element.groupId === zone.id ||
        element.zoneId === zone.id ||
        element.id === zone.id
      ) {
        markOccupied(occupancy, element.id)
        for (const seat of element.seats ?? []) markOccupied(occupancy, seat.id)
      }
    }
  }

  for (const sector of map.sectors ?? []) {
    const sectorSold = idIsSoldOut(sold, sector.id)
    for (const seat of sector.seats ?? []) {
      if (sectorSold || idIsSoldOut(sold, seat.ticketTypeId, seat.id)) {
        markOccupied(occupancy, seat.id)
      }
    }
  }

  return occupancy
}

/** If every chair is taken, the table / parent SKU is taken too. */
export function rollupOccupancyToParents(
  occupancy: Record<string, SeatStatus>,
  map: InteractiveVenueMap | null | undefined,
): Record<string, SeatStatus> {
  if (!map) return occupancy
  const next = { ...occupancy }
  for (const element of map.elements ?? []) {
    if (!isSellableElement(element)) continue
    const seats = (element.seats ?? []).filter((seat) => seat.status !== "blocked")
    if (seats.length === 0) continue
    const states = seats.map((seat) =>
      lookupOccupancyStatus(next, seat.id, element.id),
    )
    if (states.every((state) => isSoldInventoryStatus(state))) {
      next[element.id] = "occupied"
      continue
    }
    if (
      states.every(
        (state) => isSoldInventoryStatus(state) || state === "held",
      ) &&
      states.some((state) => state === "held") &&
      !isSoldInventoryStatus(next[element.id])
    ) {
      next[element.id] = "held"
    }
  }
  return next
}

export function isVenueMapElementSoldOut(
  element: VenueMapElement,
  occupancy: Record<string, SeatStatus>,
): boolean {
  const parent = lookupOccupancyStatus(occupancy, element.id)
  if (isSoldInventoryStatus(parent)) return true
  if (element.sellMode === "group") return false
  const seats = (element.seats ?? []).filter((seat) => seat.status !== "blocked")
  if (seats.length === 0) return false
  return seats.every((seat) =>
    isSoldInventoryStatus(lookupOccupancyStatus(occupancy, seat.id, element.id)),
  )
}
