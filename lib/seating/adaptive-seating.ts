import type { SeatStatus } from "@/lib/seating/universal-seat-types"
import {
  normalizePolygonToPercent,
  zoneCanvasCentroid,
} from "@/lib/seating/venue-polygon"
import type { VenueMapZone, InteractiveVenueMap } from "@/types/venue-map"
import { isSellableElement } from "@/types/venue-map"
import type { VenueLayoutType, VenueSeatingSector } from "@/types/venues"

export type VenueRenderMode = "micro" | "macro" | "hybrid"

export type ParametricInventoryState =
  | "loading"
  | "ready"
  | "unmaterialized"
  | "error"

export type ParametricOccupiedItem = {
  id: string
  label: string
  status: SeatStatus
  seatingUnitId: string | null
}

export function parametricZoneItemId(
  zoneId: string,
  row: number,
  col: number,
): string {
  return `${zoneId}-R${row}-I${col}`
}

const PARAMETRIC_ITEM_ID_RE = /^(.*)-R(\d+)-I(\d+)$/

export function parseParametricZoneItemId(
  id: string,
): { zoneId: string; row: number; col: number } | null {
  const match = PARAMETRIC_ITEM_ID_RE.exec(id)
  if (!match) return null
  return {
    zoneId: match[1]!,
    row: Number(match[2]),
    col: Number(match[3]),
  }
}

/** Compact chip label for the mobile strip. Inventory id stays zona-R{n}-I{n}. */
export function parametricZoneItemShortLabel(
  layoutType: VenueMapZone["layoutType"],
  col: number,
): string {
  const n = String(Math.max(1, Math.floor(col) || 1)).padStart(2, "0")
  return layoutType === "numbered_seat" ? `B-${n}` : `T-${n}`
}

export function countFreeByParametricRow(
  zoneId: string,
  occupancy: Record<string, ParametricOccupiedItem>,
): Record<number, number> {
  const byRow: Record<number, number> = {}
  for (const item of Object.values(occupancy)) {
    if (item.status !== "available" || !item.seatingUnitId) continue
    const parsed = parseParametricZoneItemId(item.id)
    if (!parsed || parsed.zoneId !== zoneId) continue
    byRow[parsed.row] = (byRow[parsed.row] ?? 0) + 1
  }
  return byRow
}

export function expandParametricZone(
  zone: VenueMapZone,
): VenueSeatingSector {
  if (zone.layoutType === "general") {
    return {
      id: zone.id,
      sector_name: zone.name,
      color: zone.color,
      pricing_tier_id: null,
      layout_type: "general",
      capacity_per_unit: 1,
      rows: [],
    }
  }

  const { rows, layoutType } = parametricZoneGrid(zone)
  const unitCapacity =
    layoutType === "numbered_seat"
      ? 1
      : Math.min(100, Math.max(1, Math.floor(zone.capacityPerUnit) || 1))

  return {
    id: zone.id,
    sector_name: zone.name,
    color: zone.color,
    pricing_tier_id: null,
    layout_type: layoutType,
    capacity_per_unit: unitCapacity,
    rows: Array.from({ length: rows }, (_, rowIndex) => {
      const rowNumber = rowIndex + 1
      return {
        row_id: `${zone.id}-row-${rowNumber}`,
        row_number: rowNumber,
        row_label: `Fila ${rowNumber}`,
        items: parametricZoneRowItems(zone, rowNumber).map((item) => ({
          id: item.id,
          label: item.label,
          capacity: unitCapacity,
          status: "available" as const,
        })),
      }
    }),
  }
}

export function parametricZoneCapacity(zone: VenueMapZone): number {
  if (zone.layoutType === "general") {
    return Math.max(0, Math.floor(zone.capacity) || 0)
  }
  const rows = Math.max(1, Math.floor(zone.rows) || 1)
  const cols = Math.max(1, Math.floor(zone.itemsPerRow) || 1)
  if (zone.layoutType === "numbered_seat") return rows * cols
  return rows * cols * Math.min(100, Math.max(1, Math.floor(zone.capacityPerUnit) || 1))
}

export function hasParametricZones(map: InteractiveVenueMap | null | undefined): boolean {
  return (map?.zones?.length ?? 0) > 0
}

export function hasMicroInventory(map: InteractiveVenueMap | null | undefined): boolean {
  if (!map) return false
  const sellable = (map.elements ?? []).filter(isSellableElement)
  return map.sectors.length > 0 || sellable.length > 0
}

export function resolveVenueRenderMode(
  map: InteractiveVenueMap | null | undefined,
): VenueRenderMode {
  const parametric = hasParametricZones(map)
  const micro = hasMicroInventory(map)
  if (parametric && micro) return "hybrid"
  if (parametric) return "macro"
  return "micro"
}

export function seatingRenderModeCopy(mode: VenueRenderMode): {
  hint: string
  cta: string
} {
  if (mode === "macro") {
    return {
      hint: "Tocá un polígono. Después fila y mesa en la tira de abajo.",
      cta: "Elegir zona",
    }
  }
  if (mode === "hybrid") {
    return {
      hint: "Las butacas del plano y las zonas conviven. Tocá una butaca o un polígono; la zona se elige en la tira de abajo.",
      cta: "Elegir zona o butaca",
    }
  }
  return {
    hint: "Elegí mesa, tablón o butaca en el mapa.",
    cta: "Abrir mapa de ubicaciones",
  }
}

export function listMicroOccupancySectorIds(
  map: InteractiveVenueMap | null | undefined,
): string[] {
  if (!map) return []
  const ids = [
    ...map.sectors.map((sector) => sector.id),
    ...[
      ...new Set(
        (map.elements ?? [])
          .filter(isSellableElement)
          .map((element) => element.groupId?.trim() || element.id),
      ),
    ],
  ]
  return [...new Set(ids.filter(Boolean))]
}

export function listAdaptiveOccupancySectorIds(
  map: InteractiveVenueMap | null | undefined,
): string[] {
  if (!map) return []
  return [
    ...new Set([
      ...listMicroOccupancySectorIds(map),
      ...(map.zones ?? []).map((zone) => zone.id),
    ]),
  ]
}

export type ParametricStripRow = {
  rowId: string
  rowLabel: string
  items: Array<{ id: string; label: string }>
}

export type ParametricZoneRowMeta = {
  rowId: string
  rowLabel: string
  rowNumber: number
  itemCount: number
}

export function parametricZoneGrid(zone: VenueMapZone): {
  rows: number
  itemsPerRow: number
  prefix: string
  layoutType: VenueLayoutType
} {
  const rows = Math.min(80, Math.max(1, Math.floor(zone.rows) || 1))
  const itemsPerRow = Math.min(80, Math.max(1, Math.floor(zone.itemsPerRow) || 1))
  const layoutType: VenueLayoutType =
    zone.layoutType === "numbered_seat" ? "numbered_seat" : "table_combo"
  const rawPrefix = (zone.labelPrefix ?? "").replace(/^\s+/, "")
  const prefix = rawPrefix || (layoutType === "numbered_seat" ? "Butaca " : "Mesa ")
  return { rows, itemsPerRow, prefix, layoutType }
}

export function listParametricZoneRowMeta(zone: VenueMapZone): ParametricZoneRowMeta[] {
  if (zone.layoutType === "general") return []
  const { rows, itemsPerRow } = parametricZoneGrid(zone)
  return Array.from({ length: rows }, (_, rowIndex) => {
    const rowNumber = rowIndex + 1
    return {
      rowId: `${zone.id}-row-${rowNumber}`,
      rowLabel: `Fila ${rowNumber}`,
      rowNumber,
      itemCount: itemsPerRow,
    }
  })
}

export function parametricZoneRowItems(
  zone: VenueMapZone,
  rowNumber: number,
): Array<{ id: string; label: string }> {
  if (zone.layoutType === "general") return []
  const { itemsPerRow, prefix } = parametricZoneGrid(zone)
  const row = Math.min(80, Math.max(1, Math.floor(rowNumber) || 1))
  return Array.from({ length: itemsPerRow }, (_, colIndex) => {
    const col = colIndex + 1
    const number = (row - 1) * itemsPerRow + col
    return {
      id: parametricZoneItemId(zone.id, row, col),
      label: `${prefix}${number}`,
    }
  })
}

export function listParametricZoneRows(zone: VenueMapZone): ParametricStripRow[] {
  return listParametricZoneRowMeta(zone).map((row) => ({
    rowId: row.rowId,
    rowLabel: row.rowLabel,
    items: parametricZoneRowItems(zone, row.rowNumber),
  }))
}

export function expectedParametricUnitCount(zone: VenueMapZone): number {
  if (zone.layoutType === "general") return 0
  const { rows, itemsPerRow } = parametricZoneGrid(zone)
  return rows * itemsPerRow
}

export function mergeParametricOccupancy(input: {
  zone: VenueMapZone
  units: Array<{
    id: string
    layoutItemId: string
    status: string
    label?: string | null
  }>
}): {
  state: Extract<ParametricInventoryState, "ready" | "unmaterialized">
  byLayoutItemId: Record<string, ParametricOccupiedItem>
} {
  const expected = expectedParametricUnitCount(input.zone)
  const byLayoutItemId: Record<string, ParametricOccupiedItem> = {}
  if (expected > 0 && input.units.length === 0) {
    return { state: "unmaterialized", byLayoutItemId }
  }
  for (const unit of input.units) {
    byLayoutItemId[unit.layoutItemId] = {
      id: unit.layoutItemId,
      label: unit.label?.trim() || unit.layoutItemId,
      status:
        unit.status === "available"
          ? "available"
          : unit.status === "blocked"
            ? "blocked"
            : "occupied",
      seatingUnitId: unit.id,
    }
  }
  return { state: "ready", byLayoutItemId }
}

const ZONE_PRESETS = [
  { name: "Sector Naranja", color: "#f97316" },
  { name: "Sector Lima", color: "#a3e635" },
  { name: "Sector Cian", color: "#22d3ee" },
  { name: "Sector Magenta", color: "#e879f9" },
  { name: "Sector Oro", color: "#facc15" },
] as const

export function createVenueZone(
  index: number,
  polygon: { x: number; y: number }[],
): VenueMapZone {
  const preset = ZONE_PRESETS[index % ZONE_PRESETS.length]!
  return {
    id: `zone-${crypto.randomUUID().slice(0, 8)}`,
    name: preset.name,
    color: preset.color,
    price: 0,
    polygon: normalizePolygonToPercent(polygon),
    layoutType: "table_combo",
    sellMode: "group",
    rows: 4,
    itemsPerRow: 10,
    capacityPerUnit: 8,
    capacity: 40,
    labelPrefix: "Mesa ",
  }
}

export function zoneCentroid(zone: VenueMapZone): { x: number; y: number } {
  return zoneCanvasCentroid(zone)
}
