import type {
  InteractiveVenueMap,
  VenueMapElement,
  VenueMapSeat,
  VenueMapSeatStatus,
  VenueMapSector,
} from "@/types/venue-map"
import { emptyVenueMap, isSellableElement } from "@/types/venue-map"
import { resolveSectorRowsConfig } from "@/lib/seating/venue-rows-config"
import type { VenueLayoutType, VenueSeatingLayout } from "@/types/venues"
import {
  expandParametricZone,
  parametricZoneCapacity,
} from "@/lib/seating/adaptive-seating"
import { elementSeatLabel } from "@/lib/seating/venue-element-geometry"
import { getVenueSeatDisplayName, venueElementTicketLabel } from "@/lib/map-utils"
import { venueElementSelectionName } from "@/lib/seating/storefront-selection"

const SEAT_GAP = 18
const ROW_GAP = 20

export function rebuildSectorSeats(sector: VenueMapSector): VenueMapSeat[] {
  const rowsConfig = resolveSectorRowsConfig(sector, {
    maxRows: 40,
    maxSeats: 40,
  })
  const maxSeats = Math.max(1, ...rowsConfig.map((row) => row.seatCount), 1)
  const curvature = Math.min(1, Math.max(0, Number(sector.curvature) || 0))
  const aisle = Boolean(sector.aisle)
  const seats: VenueMapSeat[] = []
  const cx = sector.x
  const cy = sector.y
  const maxWidth = (maxSeats - 1) * SEAT_GAP + (aisle ? 28 : 0)

  rowsConfig.forEach((row, rowIndex) => {
    const seatCount = row.seatCount
    const rowLabel = String(rowIndex + 1)
    const radius = 70 + rowIndex * ROW_GAP
    const half = Math.floor(seatCount / 2)
    const slots = seatCount + (aisle ? 1 : 0)
    const rowWidth = Math.max(0, seatCount - 1) * SEAT_GAP + (aisle ? 28 : 0)
    const offsetX = (maxWidth - rowWidth) / 2
    for (let seatIndex = 0; seatIndex < seatCount; seatIndex += 1) {
      const slot = aisle && seatIndex >= half ? seatIndex + 1 : seatIndex
      const t = slots <= 1 ? 0.5 : slot / (slots - 1)
      let x: number
      let y: number
      if (curvature < 0.02) {
        const aisleGap = aisle && seatIndex >= half ? 28 : 0
        x = cx + offsetX + seatIndex * SEAT_GAP + aisleGap
        y = cy + rowIndex * ROW_GAP
      } else {
        const maxAngle = curvature * 0.95
        const angle = -maxAngle + t * 2 * maxAngle
        x = cx + Math.sin(angle) * radius
        y = cy + Math.cos(angle) * radius * 0.55 + rowIndex * (ROW_GAP * 0.35)
      }
      seats.push({
        id: `${sector.id}-F${rowLabel}-A${seatIndex + 1}`,
        row: row.label?.trim() || rowLabel,
        number: seatIndex + 1,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        status: "available",
      })
    }
  })

  return seats
}

export function elementInventorySectorId(element: VenueMapElement): string {
  return element.groupId?.trim() || element.id
}

function elementUnitCapacity(element: VenueMapElement): number {
  const active = element.seats.filter((seat) => seat.status !== "blocked").length
  return Math.min(
    100,
    Math.max(1, active || element.chairCount || element.capacity || 1),
  )
}

function serializeStandaloneElement(element: VenueMapElement) {
  if (element.type === "standing_zone") {
    return {
      id: element.id,
      sector_name: element.label,
      color: element.color,
      pricing_tier_id: null,
      layout_type: "general" as VenueLayoutType,
      capacity_per_unit: 1,
      rows: [],
    }
  }

  const groupSale = element.sellMode === "group"
  const activeSeats = element.seats.filter((seat) => seat.status !== "blocked")
  if (groupSale) {
    return {
      id: element.id,
      sector_name: element.label,
      color: element.color,
      pricing_tier_id: null,
      layout_type: "table_combo" as VenueLayoutType,
      capacity_per_unit: Math.max(1, activeSeats.length || element.chairCount || 1),
      rows: [
        {
          row_id: `${element.id}-group`,
          row_number: 1,
          row_label: venueElementTicketLabel(element) || element.label,
          items: [
            {
              id: element.id,
              label: venueElementTicketLabel(element) || element.label,
              capacity: Math.max(1, activeSeats.length || 1),
              status: "available" as const,
            },
          ],
        },
      ],
    }
  }

  return {
    id: element.id,
    sector_name: element.label,
    color: element.color,
    pricing_tier_id: null,
    layout_type: "numbered_seat" as VenueLayoutType,
    capacity_per_unit: 1,
    rows: [
      {
        row_id: `${element.id}-row`,
        row_number: 1,
        row_label: element.label,
        items: element.seats.map((seat) => ({
          id: seat.id,
          label: elementSeatLabel(element, seat.number, seat),
          capacity: 1,
          status:
            seat.status === "available"
              ? ("available" as const)
              : ("blocked" as const),
        })),
      },
    ],
  }
}

function serializeElementGroup(groupId: string, members: VenueMapElement[]) {
  const head = members[0]!
  const name = head.groupName?.trim() || head.label
  const standing = members.filter((item) => item.type === "standing_zone")
  const furniture = members.filter((item) => item.type !== "standing_zone")
  const sectors = standing.map((item) => serializeStandaloneElement(item))
  if (furniture.length === 0) return sectors

  const allGroupSale = furniture.every((item) => item.sellMode === "group")
  const byRing = new Map<number, VenueMapElement[]>()
  for (const item of furniture) {
    const ring = item.ringIndex ?? 0
    const list = byRing.get(ring) ?? []
    list.push(item)
    byRing.set(ring, list)
  }
  const rings = [...byRing.entries()].sort((a, b) => a[0] - b[0])

  if (allGroupSale) {
    const capacity = Math.max(...furniture.map((item) => elementUnitCapacity(item)))
    return [
      ...sectors,
      {
        id: groupId,
        sector_name: name,
        color: head.color,
        pricing_tier_id: null,
        layout_type: "table_combo" as VenueLayoutType,
        capacity_per_unit: capacity,
        rows: rings.slice(0, 200).map(([ring, items], index) => ({
          row_id: `${groupId}-ring-${ring}`,
          row_number: index + 1,
          row_label: `Fila ${ring + 1}`,
          items: items.map((item) => ({
            id: item.id,
            label: venueElementTicketLabel(item) || item.label,
            capacity: elementUnitCapacity(item),
            status: "available" as const,
          })),
        })),
      },
    ]
  }

  return [
    ...sectors,
    {
      id: groupId,
      sector_name: name,
      color: head.color,
      pricing_tier_id: null,
      layout_type: "numbered_seat" as VenueLayoutType,
      capacity_per_unit: 1,
      rows: rings.slice(0, 200).map(([ring, items], index) => ({
        row_id: `${groupId}-ring-${ring}`,
        row_number: index + 1,
        row_label: `Fila ${ring + 1}`,
        items: items.flatMap((item) =>
          item.sellMode === "group"
            ? [
                {
                  id: item.id,
                  label: venueElementTicketLabel(item) || item.label,
                  capacity: elementUnitCapacity(item),
                  status: "available" as const,
                },
              ]
            : item.seats.map((seat) => ({
                id: seat.id,
                label: elementSeatLabel(item, seat.number, seat),
                capacity: 1,
                status:
                  seat.status === "blocked"
                    ? ("blocked" as const)
                    : ("available" as const),
              })),
        ),
      })),
    },
  ]
}

export function venueMapToSeatingLayout(
  map: InteractiveVenueMap,
): VenueSeatingLayout {
  const fromSectors = map.sectors.map((sector) => {
    const byRow = new Map<string, VenueMapSeat[]>()
    for (const seat of sector.seats) {
      const list = byRow.get(seat.row) ?? []
      list.push(seat)
      byRow.set(seat.row, list)
    }
    const rows = [...byRow.entries()].map(([rowLabel, rowSeats], index) => ({
      row_id: `${sector.id}-row-${rowLabel}`,
      row_number: index + 1,
      row_label: `Fila ${rowLabel}`,
      items: rowSeats.map((seat) => ({
        id: seat.id,
        label:
          seat.customLabel?.trim() ||
          seat.label?.trim() ||
          `${rowLabel}-${seat.number}`,
        capacity: 1,
        status:
          seat.status === "blocked"
            ? ("blocked" as const)
            : ("available" as const),
      })),
    }))
    return {
      id: sector.id,
      sector_name: sector.name,
      color: sector.color,
      pricing_tier_id: null,
      layout_type: "numbered_seat" as const,
      capacity_per_unit: 1,
      rows,
    }
  })

  const grouped = new Map<string, VenueMapElement[]>()
  const standalone: VenueMapElement[] = []
  for (const element of (map.elements ?? []).filter(isSellableElement)) {
    const groupId = element.groupId?.trim()
    if (!groupId) {
      standalone.push(element)
      continue
    }
    const list = grouped.get(groupId) ?? []
    list.push(element)
    grouped.set(groupId, list)
  }

  const fromElements = [
    ...standalone.map((element) => serializeStandaloneElement(element)),
    ...[...grouped.entries()].flatMap(([groupId, members]) =>
      serializeElementGroup(groupId, members),
    ),
  ]

  const fromZones = (map.zones ?? []).map((zone) => expandParametricZone(zone))

  return [...fromSectors, ...fromElements, ...fromZones]
}

export function venueMapCapacity(map: InteractiveVenueMap): number {
  const sectorSeats = map.sectors.reduce(
    (sum, sector) =>
      sum + sector.seats.filter((seat) => seat.status !== "blocked").length,
    0,
  )
  const elementSeats = (map.elements ?? []).reduce((sum, element) => {
    if (!isSellableElement(element)) return sum
    if (element.type === "standing_zone") {
      return sum + Math.max(0, Math.floor(element.capacity) || 0)
    }
    if (element.sellMode === "group") {
      return (
        sum +
        Math.max(
          1,
          element.seats.filter((seat) => seat.status !== "blocked").length,
        )
      )
    }
    return (
      sum + element.seats.filter((seat) => seat.status !== "blocked").length
    )
  }, 0)
  const zoneSeats = (map.zones ?? []).reduce(
    (sum, zone) => sum + parametricZoneCapacity(zone),
    0,
  )
  return sectorSeats + elementSeats + zoneSeats
}

export function seatingLayoutToVenueMap(
  layout: VenueSeatingLayout,
  existing?: InteractiveVenueMap | null,
): InteractiveVenueMap {
  if (
    existing &&
    (existing.sectors.length > 0 ||
      (existing.elements?.length ?? 0) > 0 ||
      (existing.zones?.length ?? 0) > 0)
  ) {
    return existing
  }
  const map = emptyVenueMap()
  map.sectors = layout
    .filter((sector) => sector.layout_type === "numbered_seat")
    .map((sector, index) => {
      const rows = sector.rows ?? []
      const seatsPerRow = Math.max(
        1,
        ...rows.map((row) => row.items.length),
        1,
      )
      const rowsConfig = rows.map((row, rowIndex) => ({
        label:
          String(row.row_label ?? "")
            .replace(/^Fila\s+/i, "")
            .trim() || String(rowIndex + 1),
        seatCount: Math.max(1, row.items.length),
      }))
      const draft: VenueMapSector = {
        id: sector.id,
        name: sector.sector_name,
        color: sector.color || "#f97316",
        price: 0,
        x: 180,
        y: 140 + index * 90,
        rows: Math.max(1, rows.length),
        seatsPerRow,
        rowsConfig,
        curvature: 0,
        aisle: false,
        seats: [],
      }
      const generated = rebuildSectorSeats(draft)
      let generatedOffset = 0
      draft.seats = rows.flatMap((row, rowIndex) => {
        const slice = generated.slice(
          generatedOffset,
          generatedOffset + row.items.length,
        )
        generatedOffset += row.items.length
        return row.items.map((item, seatIndex) => {
          const generatedSeat = slice[seatIndex]
          return {
            id: item.id,
            row: String(rowIndex + 1),
            number: seatIndex + 1,
            x: generatedSeat?.x ?? draft.x + seatIndex * 18,
            y: generatedSeat?.y ?? draft.y + rowIndex * 20,
            status: item.status === "available" ? "available" : "blocked",
          }
        })
      })
      return draft
    })
  map.elements = existing?.elements ?? []
  map.zones = existing?.zones ?? []
  map.backgroundImage = existing?.backgroundImage ?? map.backgroundImage
  map.backgroundOpacity = existing?.backgroundOpacity ?? map.backgroundOpacity
  map.backgroundScale = existing?.backgroundScale ?? map.backgroundScale
  map.backgroundX = existing?.backgroundX ?? map.backgroundX
  map.backgroundY = existing?.backgroundY ?? map.backgroundY
  return map
}

export type FlattenedVenueSeat = {
  id: string
  row: string
  number: number
  x: number
  y: number
  sectorId: string
  sectorName: string
  color: string
  price: number
  mapStatus: VenueMapSeatStatus
  source: "sector" | "element"
  label?: string
}

export function flattenVenueMapSeats(map: InteractiveVenueMap): FlattenedVenueSeat[] {
  const zoneIds = new Set((map.zones ?? []).map((zone) => zone.id))
  const fromSectors = map.sectors.flatMap((sector) => {
    if (zoneIds.has(sector.id)) return []
    return sector.seats.map((seat) => ({
      id: seat.id,
      row: seat.row,
      number: seat.number,
      x: seat.x,
      y: seat.y,
      sectorId: sector.id,
      sectorName: sector.name,
      color: sector.color,
      price: seat.price ?? sector.price,
      mapStatus: seat.status,
      source: "sector" as const,
    }))
  })
  const fromElements = (map.elements ?? []).flatMap((element) => {
    if (zoneIds.has(element.id) || (element.groupId && zoneIds.has(element.groupId))) {
      return []
    }
    if (!isSellableElement(element) || element.type === "standing_zone") {
      return []
    }
    if (element.sellMode === "group") {
      const label = venueElementSelectionName(element)
      return [
        {
          id: element.id,
          row: venueElementTicketLabel(element) || element.label,
          number: 0,
          x: element.x,
          y: element.y,
          sectorId: elementInventorySectorId(element),
          sectorName: element.sectorName || element.groupName || element.label,
          color: element.color,
          price: element.price,
          mapStatus: "available" as const,
          source: "element" as const,
          label,
        },
      ]
    }
    return element.seats.map((seat) => ({
      id: seat.id,
      row: venueElementTicketLabel(element) || element.label,
      number: seat.number,
      x: seat.x,
      y: seat.y,
      sectorId: elementInventorySectorId(element),
      sectorName: element.sectorName || element.groupName || element.label,
      color: element.color,
      price: seat.price ?? element.price,
      mapStatus: seat.status,
      source: "element" as const,
      label: getVenueSeatDisplayName(element, seat),
    }))
  })
  return [...fromSectors, ...fromElements]
}

function flattenSellableElement(
  element: VenueMapElement,
  sectorNameFallback = "",
): FlattenedVenueSeat[] {
  if (!isSellableElement(element) || element.type === "standing_zone") {
    return []
  }
  const sectorId = elementInventorySectorId(element)
  const sectorName =
    element.sectorName || element.groupName || sectorNameFallback || element.label
  if (element.sellMode === "group") {
    return [
      {
        id: element.id,
        row: venueElementTicketLabel(element) || element.label,
        number: 0,
        x: element.x,
        y: element.y,
        sectorId,
        sectorName,
        color: element.color,
        price: element.price,
        mapStatus: "available",
        source: "element",
        label: venueElementSelectionName(element),
      },
    ]
  }
  return element.seats.map((seat) => ({
    id: seat.id,
    row: venueElementTicketLabel(element) || element.label,
    number: seat.number,
    x: seat.x,
    y: seat.y,
    sectorId,
    sectorName,
    color: element.color,
    price: seat.price ?? element.price,
    mapStatus: seat.status,
    source: "element" as const,
    label: getVenueSeatDisplayName(element, seat),
  }))
}

/** Includes zone-grouped tables/gradas skipped by flattenVenueMapSeats. */
export function flattenSeatsForAvailability(
  map: InteractiveVenueMap,
): FlattenedVenueSeat[] {
  const base = flattenVenueMapSeats(map)
  const seen = new Set(base.map((seat) => seat.id))
  const extras: FlattenedVenueSeat[] = []
  const zoneNameById = new Map(
    (map.zones ?? []).map((zone) => [zone.id, zone.name] as const),
  )
  for (const element of map.elements ?? []) {
    const zoneName =
      (element.groupId && zoneNameById.get(element.groupId)) ||
      zoneNameById.get(element.id) ||
      ""
    for (const seat of flattenSellableElement(element, zoneName)) {
      if (seen.has(seat.id)) continue
      seen.add(seat.id)
      extras.push(seat)
    }
  }
  for (const zone of map.zones ?? []) {
    if (zone.layoutType === "general") continue
    const hasMaterializedPlaces = (map.elements ?? []).some(
      (element) =>
        isSellableElement(element) &&
        (element.groupId === zone.id || element.id === zone.id),
    )
    if (hasMaterializedPlaces) continue
    const expanded = expandParametricZone(zone)
    let index = 0
    for (const row of expanded.rows) {
      for (const item of row.items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        extras.push({
          id: item.id,
          row: row.row_label,
          number: ++index,
          x: 0,
          y: 0,
          sectorId: zone.id,
          sectorName: zone.name,
          color: zone.color,
          price: zone.price,
          mapStatus: "available",
          source: "sector",
          label: item.label,
        })
      }
    }
  }
  return [...base, ...extras]
}

export function venueMapHasInventory(map: InteractiveVenueMap | null | undefined): boolean {
  if (!map) return false
  const sellable = (map.elements ?? []).some((element) => isSellableElement(element))
  return (
    map.sectors.length > 0 ||
    sellable ||
    (map.zones?.length ?? 0) > 0
  )
}

/** Plano público: zonas, butacas, mesas o imagen de fondo del studio. */
export function hasInteractiveVenueMap(
  map: InteractiveVenueMap | null | undefined,
): map is InteractiveVenueMap {
  if (!map) return false
  if (venueMapHasInventory(map)) return true
  if (typeof map.backgroundImage === "string" && map.backgroundImage.trim()) {
    return true
  }
  return (map.elements?.length ?? 0) > 0
}

export function venueMapStudioStatus(map: InteractiveVenueMap | null | undefined): string {
  if (!map || !venueMapHasInventory(map)) return "Sin mapa configurado"
  const elements = map.elements ?? []
  const tables = elements.filter(
    (item) =>
      item.type === "round_table" ||
      item.type === "long_table" ||
      item.type === "vip_box",
  ).length
  const groups = new Set(
    elements.map((item) => item.groupId).filter((id): id is string => Boolean(id)),
  )
  const zoneCount = map.zones?.length ?? 0
  const sectorCount = map.sectors.length + groups.size + zoneCount
  const seats =
    map.sectors.reduce((sum, sector) => sum + sector.seats.length, 0) +
    elements.filter((item) => item.type === "vip_chair").length
  if (zoneCount > 0 && tables === 0 && seats === 0) {
    return `${zoneCount} ${zoneCount === 1 ? "zona paramétrica" : "zonas paramétricas"}`
  }
  if (tables > 0 && sectorCount > 0) {
    return `${tables} ${tables === 1 ? "mesa" : "mesas"} en ${sectorCount} ${
      sectorCount === 1 ? "sector" : "sectores"
    }`
  }
  if (seats > 0 && sectorCount > 0) {
    return `${seats} ${seats === 1 ? "butaca" : "butacas"} en ${sectorCount} ${
      sectorCount === 1 ? "sector" : "sectores"
    }`
  }
  const capacity = venueMapCapacity(map)
  return `${capacity} ${capacity === 1 ? "lugar configurado" : "lugares configurados"}`
}
