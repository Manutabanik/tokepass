import { inventoryRowMatchesActiveDay } from "@/lib/checkout/seat-hold-day"
import { selectableTicketStock } from "@/lib/checkout/ticket-stock"
import { BUYER_SEAT_FILL } from "@/lib/seating/buyer-seat-fill"
import { mergeInventoryOccupancy, isSoldInventoryStatus } from "@/lib/seating/inventory-seat-state"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import {
  expandOccupancyToVenueMap,
  lookupOccupancyStatus,
  occupancyFromSeatingUnits,
} from "@/lib/seating/venue-map-occupancy"
import {
  isSellableElement,
  type InteractiveVenueMap,
  type VenueMapElement,
} from "@/types/venue-map"

export const SOLD_MAP_FILL = BUYER_SEAT_FILL.sold
export const SOLD_MAP_STROKE = "#374151"

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

const VOID_TICKET_STATUS = new Set([
  "cancelled",
  "refunded",
  "revoked",
])

export type SoldTicketRef = {
  seat_id?: string | null
  seating_unit_id?: string | null
  layout_item_id?: string | null
  event_date_id?: string | null
  status?: string | null
}

export type VenueMapSeatingUnitRef = {
  id?: string | null
  layoutItemId: string
  status: string
  reservedUntil?: string | null
  holdExpiresAt?: string | null
  sold?: boolean
  soldOrderId?: string | null
  eventDateId?: string | null
}

export type VenueMapLiveInventory = {
  seatingUnits?: readonly VenueMapSeatingUnitRef[]
  soldTickets?: readonly SoldTicketRef[] | Record<string, SeatStatus>
  soldOutTicketTypeIds?: Iterable<string>
  liveOccupancy?: Record<string, SeatStatus>
  eventDateId?: string | null
  scheduleDayCount?: number
  /** Con roster de unidades, los ids del JSON que no aparecen quedan ocupados. */
  lockUnknownLayoutIds?: boolean
}

/** Tickets emitidos → IDs de asiento/unidad para pintar SOLD antes del primer frame. */
export function occupancyFromSoldTicketRefs(
  tickets: ReadonlyArray<SoldTicketRef>,
  scope?: { eventDateId?: string | null; scheduleDayCount?: number },
): Record<string, SeatStatus> {
  const occupancy: Record<string, SeatStatus> = {}
  const dayCount = scope?.scheduleDayCount ?? 0
  const activeDay = scope?.eventDateId
  for (const ticket of tickets) {
    const status = (ticket.status ?? "").trim().toLowerCase()
    if (VOID_TICKET_STATUS.has(status)) continue
    if (
      !inventoryRowMatchesActiveDay(
        ticket.event_date_id,
        activeDay,
        dayCount,
      )
    ) {
      continue
    }
    markOccupied(occupancy, ticket.seat_id)
    markOccupied(occupancy, ticket.seating_unit_id)
    markOccupied(occupancy, ticket.layout_item_id)
  }
  return occupancy
}

function occupancyFromSoldTicketsResolved(
  tickets: readonly SoldTicketRef[] | Record<string, SeatStatus>,
  units: readonly VenueMapSeatingUnitRef[],
  scope?: { eventDateId?: string | null; scheduleDayCount?: number },
): Record<string, SeatStatus> {
  const occupancy: Record<string, SeatStatus> = {}
  if (Array.isArray(tickets)) {
    Object.assign(occupancy, occupancyFromSoldTicketRefs(tickets, scope))
  } else {
    Object.assign(occupancy, tickets as Record<string, SeatStatus>)
  }
  const layoutByUnitId = new Map<string, string>()
  for (const unit of units) {
    if (
      !inventoryRowMatchesActiveDay(
        unit.eventDateId,
        scope?.eventDateId,
        scope?.scheduleDayCount ?? 0,
      )
    ) {
      continue
    }
    const unitId = unit.id?.trim()
    const layout = unit.layoutItemId?.trim()
    if (unitId && layout) layoutByUnitId.set(unitId, layout)
  }
  for (const [id, status] of Object.entries(occupancy)) {
    const layout = layoutByUnitId.get(id)
    if (layout && occupancy[layout] == null) occupancy[layout] = status
  }
  return occupancy
}

export function checkInventory(
  occupancy: Record<string, SeatStatus>,
  seatId: string,
): boolean {
  return isSoldInventoryStatus(lookupOccupancyStatus(occupancy, seatId))
}

/**
 * Cruza el JSON estático del recinto con inventario vivo ANTES del primer paint.
 * No muta `staticMap`. El occupancy resultante es lo que el canvas pinta.
 */
export function hydrateVenueMapOccupancy(
  staticMap: InteractiveVenueMap | null | undefined,
  inventory: VenueMapLiveInventory,
): Record<string, SeatStatus> {
  const dayScope = {
    eventDateId: inventory.eventDateId,
    scheduleDayCount: inventory.scheduleDayCount ?? 0,
  }
  const units = (inventory.seatingUnits ?? []).filter((unit) =>
    inventoryRowMatchesActiveDay(
      unit.eventDateId,
      dayScope.eventDateId,
      dayScope.scheduleDayCount,
    ),
  )
  const lockUnknown = inventory.lockUnknownLayoutIds === true
  const knownIds =
    lockUnknown && staticMap ? collectVenueMapInventoryIds(staticMap) : []
  return expandOccupancyToVenueMap(
    rollupOccupancyToParents(
      mergeInventoryOccupancy(
        occupancyFromSeatingUnits([...units], knownIds),
        occupancyFromSoldOutTicketTypes(
          staticMap,
          inventory.soldOutTicketTypeIds ?? [],
        ),
        occupancyFromSoldTicketsResolved(
          inventory.soldTickets ?? [],
          units,
          dayScope,
        ),
        inventory.liveOccupancy,
      ),
      staticMap,
    ),
    staticMap,
  )
}

/** Estampa status=blocked / color sold en una copia. No muta el plano original. */
export function stampVenueMapInventory(
  staticMap: InteractiveVenueMap,
  occupancy: Record<string, SeatStatus>,
): InteractiveVenueMap {
  return {
    ...staticMap,
    elements: (staticMap.elements ?? []).map((element) => {
      const sold = isVenueMapElementSoldOut(element, occupancy)
      return {
        ...element,
        color: sold ? SOLD_MAP_FILL : element.color,
        seats: (element.seats ?? []).map((seat) => ({
          ...seat,
          status: isSoldInventoryStatus(
            lookupOccupancyStatus(occupancy, seat.id, element.id),
          )
            ? "blocked"
            : seat.status,
        })),
      }
    }),
    sectors: (staticMap.sectors ?? []).map((sector) => ({
      ...sector,
      seats: (sector.seats ?? []).map((seat) => ({
        ...seat,
        status: isSoldInventoryStatus(lookupOccupancyStatus(occupancy, seat.id))
          ? "blocked"
          : seat.status,
      })),
    })),
  }
}

export function hydrateVenueMap(
  staticMap: InteractiveVenueMap,
  inventory: VenueMapLiveInventory,
): { map: InteractiveVenueMap; occupancy: Record<string, SeatStatus> } {
  const occupancy = hydrateVenueMapOccupancy(staticMap, inventory)
  return { map: stampVenueMapInventory(staticMap, occupancy), occupancy }
}

export function shouldPaintBuyerMapInventory(input: {
  inventoryPending?: boolean
  snapshotReady: boolean
  hasEventId: boolean
}): boolean {
  if (input.inventoryPending) return false
  if (input.hasEventId && !input.snapshotReady) return false
  return true
}

export function isVenueMapElementSoldOut(
  element: VenueMapElement,
  occupancy: Record<string, SeatStatus>,
): boolean {
  const parent = lookupOccupancyStatus(occupancy, element.id)
  if (isSoldInventoryStatus(parent)) return true
  if (element.sellMode === "group") {
    const chairs = (element.seats ?? []).filter((seat) => seat.status !== "blocked")
    if (chairs.length === 0) return false
    return chairs.some((seat) =>
      isSoldInventoryStatus(lookupOccupancyStatus(occupancy, seat.id, element.id)),
    )
  }
  const seats = (element.seats ?? []).filter((seat) => seat.status !== "blocked")
  if (seats.length === 0) return false
  return seats.every((seat) =>
    isSoldInventoryStatus(lookupOccupancyStatus(occupancy, seat.id, element.id)),
  )
}
