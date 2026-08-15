import { resolveSectorAssignMeta, type SectorAssignMeta } from "@/lib/seating/assign-best-seats"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import {
  flattenVenueMapSeats,
  type FlattenedVenueSeat,
} from "@/lib/seating/venue-map-geometry"
import { resolveLiveVenueSeatStatus } from "@/lib/seating/venue-map-occupancy"
import type { InteractiveVenueMap } from "@/types/venue-map"
import {
  findBestAvailableSeats,
  type Seat,
} from "@/utils/seat-allocation"

export type AccessibleSeatNode = {
  id: string
  number: number
  label: string
  price: number
  status: "available" | "occupied" | "blocked" | "selected"
}

export type AccessibleRowNode = {
  id: string
  label: string
  seats: AccessibleSeatNode[]
}

export type AccessibleSectorNode = {
  id: string
  name: string
  color: string
  price: number
  kind: "ga" | "numbered"
  soldOut: boolean
  availableCount: number
  isTableSector: boolean
  capacityPerUnit: number
  sellMode: SectorAssignMeta["sellMode"]
  unitNoun: SectorAssignMeta["unitNoun"]
  rows: AccessibleRowNode[]
}

export function buildAccessibleSeatTree(input: {
  map: InteractiveVenueMap
  occupancyBySeatId?: Record<string, SeatStatus>
  selectedSeatIds?: Iterable<string>
  unavailableZoneIds?: Iterable<string>
}): AccessibleSectorNode[] {
  const selected = new Set(input.selectedSeatIds ?? [])
  const soldOut = new Set(input.unavailableZoneIds ?? [])
  const occupancy = input.occupancyBySeatId ?? {}
  const seats = flattenVenueMapSeats(input.map)
  const seatsBySector = new Map<string, FlattenedVenueSeat[]>()
  for (const seat of seats) {
    const list = seatsBySector.get(seat.sectorId) ?? []
    list.push(seat)
    seatsBySector.set(seat.sectorId, list)
  }

  const sectors: AccessibleSectorNode[] = []
  const seen = new Set<string>()

  for (const zone of input.map.zones ?? []) {
    seen.add(zone.id)
    sectors.push(
      toSectorNode({
        id: zone.id,
        name: zone.name,
        color: zone.color || "#22d3ee",
        price: zone.price ?? 0,
        seats: seatsBySector.get(zone.id) ?? [],
        occupancy,
        selected,
        soldOut: soldOut.has(zone.id),
        map: input.map,
      }),
    )
  }

  for (const sector of input.map.sectors) {
    if (seen.has(sector.id)) continue
    seen.add(sector.id)
    sectors.push(
      toSectorNode({
        id: sector.id,
        name: sector.name,
        color: sector.color,
        price: sector.price,
        seats: seatsBySector.get(sector.id) ?? [],
        occupancy,
        selected,
        soldOut: soldOut.has(sector.id),
        map: input.map,
      }),
    )
  }

  for (const [sectorId, sectorSeats] of seatsBySector) {
    if (seen.has(sectorId)) continue
    const first = sectorSeats[0]
    if (!first) continue
    sectors.push(
      toSectorNode({
        id: sectorId,
        name: first.sectorName,
        color: first.color,
        price: first.price,
        seats: sectorSeats,
        occupancy,
        selected,
        soldOut: soldOut.has(sectorId),
        map: input.map,
      }),
    )
  }

  return sectors
}

function toSectorNode(input: {
  id: string
  name: string
  color: string
  price: number
  seats: FlattenedVenueSeat[]
  occupancy: Record<string, SeatStatus>
  selected: Set<string>
  soldOut: boolean
  map: InteractiveVenueMap
}): AccessibleSectorNode {
  const rowsMap = new Map<string, AccessibleSeatNode[]>()
  for (const seat of input.seats) {
    const status = resolveLiveVenueSeatStatus({
      mapStatus: seat.mapStatus,
      occupancy: input.occupancy[seat.id],
      selected: input.selected.has(seat.id),
    })
    const rowKey = seat.row.trim() || seat.label?.trim() || seat.id
    const list = rowsMap.get(rowKey) ?? []
    list.push({
      id: seat.id,
      number: seat.number,
      label: seat.label?.trim() || String(seat.number),
      price: seat.price,
      status,
    })
    rowsMap.set(rowKey, list)
  }

  const rows = [...rowsMap.entries()]
    .sort((left, right) => compareRowLabel(left[0], right[0]))
    .map(([label, rowSeats]) => ({
      id: `${input.id}-row-${label}`,
      label,
      seats: rowSeats.sort((left, right) => left.number - right.number),
    }))

  const availableCount = rows.reduce(
    (sum, row) =>
      sum + row.seats.filter((seat) => seat.status === "available" || seat.status === "selected").length,
    0,
  )
  const tableMeta = resolveSectorAssignMeta(
    input.map,
    input.id,
    input.seats,
    input.name,
  )

  return {
    id: input.id,
    name: input.name,
    color: input.color,
    price: input.price,
    kind: rows.length > 0 ? "numbered" : "ga",
    soldOut: input.soldOut || (rows.length > 0 && availableCount === 0),
    availableCount,
    isTableSector: tableMeta.isTableSector,
    capacityPerUnit: tableMeta.capacityPerUnit,
    sellMode: tableMeta.sellMode,
    unitNoun: tableMeta.unitNoun,
    rows,
  }
}

export function assignContiguousSeats(input: {
  seats: FlattenedVenueSeat[]
  sectorId: string
  quantity: number
  occupancyBySeatId?: Record<string, SeatStatus>
  selectedSeatIds?: Iterable<string>
}): FlattenedVenueSeat[] {
  const occupancy = input.occupancyBySeatId ?? {}
  const selected = new Set(input.selectedSeatIds ?? [])
  const inSector = input.seats.filter((seat) => seat.sectorId === input.sectorId)
  const allocationSeats: Seat[] = inSector.map((seat) => ({
    id: seat.id,
    number: seat.number,
    row: seat.row,
    row_id: seat.row,
    row_name: seat.row,
    status: resolveLiveVenueSeatStatus({
      mapStatus: seat.mapStatus,
      occupancy: occupancy[seat.id],
      selected: selected.has(seat.id),
    }),
  }))

  const chosen = findBestAvailableSeats(allocationSeats, input.quantity)
  if (!chosen) return []

  const byId = new Map(inSector.map((seat) => [seat.id, seat]))
  return chosen
    .map((seat) => byId.get(seat.id))
    .filter((seat): seat is FlattenedVenueSeat => Boolean(seat))
}

function compareRowLabel(left: string, right: string): number {
  const leftNum = Number(left)
  const rightNum = Number(right)
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
    return leftNum - rightNum
  }
  return left.localeCompare(right, "es", { numeric: true })
}
