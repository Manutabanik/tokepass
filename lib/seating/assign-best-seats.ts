import { formatCurrency } from "@/lib/format"
import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import { resolveLiveVenueSeatStatus, type LiveVenueSeatStatus } from "@/lib/seating/venue-map-occupancy"
import type { FlattenedVenueSeat } from "@/lib/seating/venue-map-geometry"
import type { InteractiveVenueMap, VenueMapElement } from "@/types/venue-map"
import { findBestAvailableSeats, type Seat } from "@/utils/seat-allocation"

export type FastAssignMode = "SEATS" | "FULL_TABLES"

export type SectorAssignMeta = {
  isTableSector: boolean
  capacityPerUnit: number
  sellMode: "per_seat" | "group"
  unitNoun: "mesa" | "palco"
}

const TABLE_ELEMENT_TYPES = new Set([
  "round_table",
  "long_table",
  "vip_box",
])

function isSelectableStatus(status: LiveVenueSeatStatus): boolean {
  return status === "available" || status === "selected"
}

function tableNoun(name: string): "mesa" | "palco" {
  return /palco/i.test(name) ? "palco" : "mesa"
}

function seatsInSector(
  seats: FlattenedVenueSeat[],
  sectorId: string,
): FlattenedVenueSeat[] {
  return seats.filter((seat) => seat.sectorId === sectorId)
}

export function groupSeatsByTable(
  seats: FlattenedVenueSeat[],
): FlattenedVenueSeat[][] {
  const groups = new Map<string, FlattenedVenueSeat[]>()
  for (const seat of seats) {
    const key = seat.row.trim() || seat.label?.trim() || seat.id
    const list = groups.get(key) ?? []
    list.push(seat)
    groups.set(key, list)
  }
  return [...groups.values()].map((group) =>
    [...group].sort((left, right) => left.number - right.number),
  )
}

function liveStatus(
  seat: FlattenedVenueSeat,
  occupancy: Record<string, SeatStatus>,
  selected: Set<string>,
) {
  return resolveLiveVenueSeatStatus({
    mapStatus: seat.mapStatus,
    occupancy: occupancy[seat.id],
    selected: selected.has(seat.id),
  })
}

function isTableFullyFree(
  table: FlattenedVenueSeat[],
  occupancy: Record<string, SeatStatus>,
  selected: Set<string>,
): boolean {
  return table.every((seat) =>
    isSelectableStatus(liveStatus(seat, occupancy, selected)),
  )
}

function availableSeatCount(
  table: FlattenedVenueSeat[],
  occupancy: Record<string, SeatStatus>,
  selected: Set<string>,
): number {
  return table.filter((seat) =>
    isSelectableStatus(liveStatus(seat, occupancy, selected)),
  ).length
}

function elementMatchesSector(element: VenueMapElement, sectorId: string): boolean {
  return element.id === sectorId || element.groupId === sectorId
}

export function resolveSectorAssignMeta(
  map: InteractiveVenueMap,
  sectorId: string,
  seats: FlattenedVenueSeat[],
  sectorName = "",
): SectorAssignMeta {
  const noun = tableNoun(sectorName)
  const zone = (map.zones ?? []).find((item) => item.id === sectorId)
  if (zone?.layoutType === "table_combo") {
    return {
      isTableSector: true,
      capacityPerUnit: Math.max(1, Math.floor(zone.capacityPerUnit) || 1),
      sellMode: zone.sellMode === "group" ? "group" : "per_seat",
      unitNoun: noun,
    }
  }

  const tables = (map.elements ?? []).filter(
    (element) =>
      TABLE_ELEMENT_TYPES.has(element.type) &&
      elementMatchesSector(element, sectorId),
  )
  if (tables.length > 0) {
    const capacity = Math.max(
      1,
      ...tables.map(
        (table) =>
          Math.floor(table.chairCount) ||
          Math.floor(table.capacity) ||
          table.seats.filter((seat) => seat.status !== "blocked").length ||
          1,
      ),
    )
    const sellMode = tables.every((table) => table.sellMode === "group")
      ? "group"
      : "per_seat"
    return {
      isTableSector: true,
      capacityPerUnit: capacity,
      sellMode,
      unitNoun: /palco/i.test(sectorName) || tables.some((table) => table.type === "vip_box")
        ? "palco"
        : "mesa",
    }
  }

  const grouped = groupSeatsByTable(seatsInSector(seats, sectorId))
  const maxRow = grouped.reduce((max, table) => Math.max(max, table.length), 0)
  const fromElements = grouped.length > 0 && grouped.every((table) =>
    table.every((seat) => seat.source === "element"),
  )
  if (fromElements && maxRow > 1) {
    return {
      isTableSector: true,
      capacityPerUnit: maxRow,
      sellMode: maxRow === 1 ? "group" : "per_seat",
      unitNoun: noun,
    }
  }

  return {
    isTableSector: false,
    capacityPerUnit: 1,
    sellMode: "per_seat",
    unitNoun: noun,
  }
}

export function countAvailableTables(input: {
  seats: FlattenedVenueSeat[]
  sectorId: string
  occupancyBySeatId?: Record<string, SeatStatus>
  selectedSeatIds?: Iterable<string>
}): number {
  const occupancy = input.occupancyBySeatId ?? {}
  const selected = new Set(input.selectedSeatIds ?? [])
  return groupSeatsByTable(seatsInSector(input.seats, input.sectorId)).filter(
    (table) => isTableFullyFree(table, occupancy, selected),
  ).length
}

function toAllocationSeats(
  seats: FlattenedVenueSeat[],
  occupancy: Record<string, SeatStatus>,
  selected: Set<string>,
): Seat[] {
  return seats.map((seat) => ({
    id: seat.id,
    number: seat.number,
    row: seat.row,
    row_id: seat.row,
    row_name: seat.row,
    status: liveStatus(seat, occupancy, selected),
  }))
}

export function assignBestTableElements(input: {
  map: InteractiveVenueMap
  sectorId: string
  sectorName?: string
  count: number
  occupancyBySeatId?: Record<string, SeatStatus>
  selectedIds?: Iterable<string>
}): VenueMapElement[] {
  const count = Math.max(1, Math.floor(input.count) || 1)
  const occupancy = input.occupancyBySeatId ?? {}
  const selected = new Set(input.selectedIds ?? [])
  const sectorName = input.sectorName?.trim().toLowerCase() ?? ""

  const tables = (input.map.elements ?? []).filter((element) => {
    if (!TABLE_ELEMENT_TYPES.has(element.type)) return false
    const sameSector =
      elementMatchesSector(element, input.sectorId) ||
      (sectorName &&
        (element.sectorName?.trim().toLowerCase() === sectorName ||
          element.groupName?.trim().toLowerCase() === sectorName))
    if (!sameSector) return false
    if (selected.has(element.id)) return false
    const chairs = element.seats ?? []
    if (chairs.length === 0) return element.sellMode === "group"
    return chairs.every((seat) => {
      const live = resolveLiveVenueSeatStatus({
        mapStatus: seat.status,
        occupancy: occupancy[seat.id],
        selected: selected.has(seat.id),
      })
      return isSelectableStatus(live)
    })
  })

  return [...tables]
    .sort((left, right) =>
      (left.label || left.id).localeCompare(right.label || right.id, "es", {
        numeric: true,
      }),
    )
    .slice(0, count)
}

export function assignBestSeats(input: {
  seats: FlattenedVenueSeat[]
  sectorId: string
  count: number
  mode: FastAssignMode
  isTableSector?: boolean
  occupancyBySeatId?: Record<string, SeatStatus>
  selectedSeatIds?: Iterable<string>
}): FlattenedVenueSeat[] {
  const count = Math.max(1, Math.floor(input.count) || 1)
  const occupancy = input.occupancyBySeatId ?? {}
  const selected = new Set(input.selectedSeatIds ?? [])
  const inSector = seatsInSector(input.seats, input.sectorId)
  const byId = new Map(inSector.map((seat) => [seat.id, seat]))

  if (!input.isTableSector || input.mode === "SEATS") {
    const chosen = findBestAvailableSeats(
      toAllocationSeats(inSector, occupancy, selected),
      count,
    )
    if (!chosen) return []
    return chosen
      .map((seat) => byId.get(seat.id))
      .filter((seat): seat is FlattenedVenueSeat => Boolean(seat))
  }

  const freeTables = groupSeatsByTable(seatsInSector(input.seats, input.sectorId))
    .filter((table) => isTableFullyFree(table, occupancy, selected))
    .sort((left, right) => {
      const leftKey = left[0]?.row ?? ""
      const rightKey = right[0]?.row ?? ""
      return leftKey.localeCompare(rightKey, "es", { numeric: true })
    })

  if (freeTables.length < count) return []
  return freeTables.slice(0, count).flat()
}

export function shouldSuggestFullTables(input: {
  isTableSector: boolean
  mode: FastAssignMode
  count: number
  capacityPerUnit: number
}): boolean {
  return (
    input.isTableSector &&
    input.mode === "SEATS" &&
    input.count > Math.max(1, input.capacityPerUnit)
  )
}

export type FastAssignPreview = {
  legend: string
  buttonLabel: string
  totalPrice: number
  seatCount: number
  tableCount: number
  suggestion: string | null
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm
}

export function previewFastAssign(input: {
  isTableSector: boolean
  mode: FastAssignMode
  quantity: number
  capacityPerUnit: number
  unitPrice: number
  sellMode?: "per_seat" | "group"
  unitNoun?: "mesa" | "palco"
}): FastAssignPreview {
  const quantity = Math.max(1, Math.floor(input.quantity) || 1)
  const capacity = Math.max(1, Math.floor(input.capacityPerUnit) || 1)
  const unitPrice = Math.max(0, Number(input.unitPrice) || 0)
  const noun = input.unitNoun ?? "mesa"
  const nounPlural = noun === "palco" ? "palcos" : "mesas"
  const groupSale = input.sellMode === "group"

  if (!input.isTableSector) {
    const totalPrice = quantity * unitPrice
    return {
      legend: "",
      buttonLabel: `Reservar ${quantity} ${plural(quantity, "lugar", "lugares")} por ${formatCurrency(totalPrice)}`,
      totalPrice,
      seatCount: quantity,
      tableCount: 0,
      suggestion: null,
    }
  }

  if (input.mode === "FULL_TABLES") {
    const seatCount = groupSale ? quantity : quantity * capacity
    const totalPrice = groupSale
      ? quantity * unitPrice
      : seatCount * unitPrice
    const totalPeople = quantity * capacity
    const legend =
      quantity === 1
        ? `Se reservará 1 ${noun} completa (Capacidad total: ${totalPeople} ${plural(totalPeople, "persona", "personas")}).`
        : `Se reservarán ${quantity} ${nounPlural} completas (Capacidad total: ${totalPeople} ${plural(totalPeople, "persona", "personas")}).`
    return {
      legend,
      buttonLabel: `Reservar ${quantity} ${quantity === 1 ? noun : nounPlural} por ${formatCurrency(totalPrice)}`,
      totalPrice,
      seatCount,
      tableCount: quantity,
      suggestion: null,
    }
  }

  const tableCount = groupSale ? 1 : 1
  const seatCount = groupSale ? capacity : quantity
  const totalPrice = groupSale ? unitPrice : quantity * unitPrice
  const legend = groupSale
    ? `Se reservará 1 ${noun} completa (capacidad ${capacity} ${plural(capacity, "persona", "personas")}). Este sector se vende por ${noun}.`
    : `Se reservará 1 ${noun} con ${quantity} ${plural(quantity, "lugar asignado", "lugares asignados")}.`

  return {
    legend,
    buttonLabel: groupSale
      ? `Reservar 1 ${noun} por ${formatCurrency(totalPrice)}`
      : `Reservar ${quantity} ${plural(quantity, "lugar", "lugares")} por ${formatCurrency(totalPrice)}`,
    totalPrice,
    seatCount,
    tableCount,
    suggestion: shouldSuggestFullTables({
      isTableSector: true,
      mode: "SEATS",
      count: quantity,
      capacityPerUnit: capacity,
    })
      ? `Una ${noun} admite hasta ${capacity} ${plural(capacity, "persona", "personas")}. Te sugerimos pasar a ${nounPlural} completas.`
      : null,
  }
}

export function availableOnBestTable(input: {
  seats: FlattenedVenueSeat[]
  sectorId: string
  occupancyBySeatId?: Record<string, SeatStatus>
  selectedSeatIds?: Iterable<string>
}): number {
  const occupancy = input.occupancyBySeatId ?? {}
  const selected = new Set(input.selectedSeatIds ?? [])
  return groupSeatsByTable(seatsInSector(input.seats, input.sectorId)).reduce(
    (max, table) => Math.max(max, availableSeatCount(table, occupancy, selected)),
    0,
  )
}
