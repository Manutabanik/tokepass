import { polarFromUp } from "@/lib/seating/concentric-ring"
import {
  createVenueElement,
  rebuildElementSeats,
  VENUE_SHAPE,
} from "@/lib/seating/venue-element-geometry"
import { VENUE_MAP_CANVAS } from "@/lib/seating/venue-polygon"
import type { VenueMapElement } from "@/types/venue-map"

export type GridArrayKind = "vip_chair" | "round_table" | "long_table"

export const GRID_ARRAY_MAX_ITEMS = 800

/** Center-to-center pitch before the user gap is added. */
export const GRID_ARRAY_BASE_PITCH: Record<GridArrayKind, { x: number; y: number }> = {
  vip_chair: { x: VENUE_SHAPE.theatreSeat + 6, y: VENUE_SHAPE.theatreSeat + 8 },
  round_table: { x: 56, y: 56 },
  long_table: { x: VENUE_SHAPE.longTableWidth + 12, y: VENUE_SHAPE.longTableHeight + 16 },
}

export type GridArrayConfig = {
  type: GridArrayKind
  rows: number
  columns: number
  gap: number
  origin?: { x: number; y: number }
  color?: string
  groupName?: string
  price?: number
}

export type ArcDistributeOptions = {
  sweepDeg?: number
  radius?: number
  /** Point the seats should face. Defaults toward the top of the canvas (stage). */
  focus?: { x: number; y: number }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export function clampGridArraySize(rows: number, columns: number): {
  rows: number
  columns: number
} {
  let nextRows = clampInt(rows, 1, 80)
  let nextCols = clampInt(columns, 1, 80)
  if (nextRows * nextCols <= GRID_ARRAY_MAX_ITEMS) {
    return { rows: nextRows, columns: nextCols }
  }
  nextCols = Math.max(1, Math.floor(GRID_ARRAY_MAX_ITEMS / nextRows))
  if (nextRows * nextCols > GRID_ARRAY_MAX_ITEMS) {
    nextRows = Math.max(1, Math.floor(GRID_ARRAY_MAX_ITEMS / nextCols))
  }
  return { rows: nextRows, columns: nextCols }
}

function slugGroupId(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 36)
  return slug || "bloque"
}

export function generateGridArray(config: GridArrayConfig): VenueMapElement[] {
  const { rows, columns } = clampGridArraySize(config.rows, config.columns)
  const gap = Math.min(80, Math.max(0, Number(config.gap) || 0))
  const kind = config.type
  const pitchX = GRID_ARRAY_BASE_PITCH[kind].x + gap
  const pitchY = GRID_ARRAY_BASE_PITCH[kind].y + gap
  const width = Math.max(0, columns - 1) * pitchX
  const originX =
    config.origin?.x ??
    Math.round((VENUE_MAP_CANVAS.width - width) / 2)
  const originY = config.origin?.y ?? 120
  const groupName = (config.groupName ?? "Bloque").trim() || "Bloque"
  const groupId = `grid-${slugGroupId(groupName)}-${crypto.randomUUID().slice(0, 8)}`
  const color = config.color?.trim() || "#f97316"
  const price = Math.max(0, Number(config.price) || 0)
  const elements: VenueMapElement[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const index = row * columns + col
      const point = {
        x: Math.round((originX + col * pitchX) * 10) / 10,
        y: Math.round((originY + row * pitchY) * 10) / 10,
      }
      const created = createVenueElement(kind, index, point)
      created.groupId = groupId
      created.groupName = groupName
      created.ringIndex = row
      created.color = color
      created.price = price
      created.sellMode = kind === "vip_chair" ? "per_seat" : "group"
      created.priceMode = kind === "vip_chair" ? "per_person" : "closed_unit"
      created.seats = rebuildElementSeats(created)
      elements.push(created)
    }
  }

  return elements
}

function selectedSet(ids: Iterable<string>): Set<string> {
  return ids instanceof Set ? ids : new Set(ids)
}

export function distributeOnArc(
  elements: VenueMapElement[],
  selectedIds: Iterable<string>,
  options: ArcDistributeOptions = {},
): VenueMapElement[] {
  const ids = selectedSet(selectedIds)
  const selected = elements.filter((element) => ids.has(element.id))
  if (selected.length < 2) return elements

  const ordered = [...selected].sort((a, b) => a.x - b.x || a.y - b.y)
  const cx = ordered.reduce((sum, element) => sum + element.x, 0) / ordered.length
  const cy = ordered.reduce((sum, element) => sum + element.y, 0) / ordered.length
  const minX = Math.min(...ordered.map((element) => element.x))
  const maxX = Math.max(...ordered.map((element) => element.x))
  const sweepDeg = Math.min(320, Math.max(20, options.sweepDeg ?? 120))
  const sweepRad = (sweepDeg * Math.PI) / 180
  const span = Math.max(maxX - minX, ordered.length * 16)
  const radius = Math.max(
    40,
    options.radius ?? span / (2 * Math.sin(Math.max(0.08, sweepRad / 2))),
  )

  const focus = options.focus ?? { x: cx, y: 24 }
  const towardTop = focus.y <= cy
  const midAngle = towardTop ? 180 : 0
  const fx = cx
  const fy = towardTop ? cy - radius : cy + radius

  const nextById = new Map<string, VenueMapElement>()
  ordered.forEach((element, index) => {
    const t = ordered.length === 1 ? 0.5 : index / (ordered.length - 1)
    const angle = towardTop
      ? midAngle + sweepDeg / 2 - t * sweepDeg
      : midAngle - sweepDeg / 2 + t * sweepDeg
    const point = polarFromUp(fx, fy, radius, angle)
    const next: VenueMapElement = {
      ...element,
      x: point.x,
      y: point.y,
      rotation: angle,
    }
    next.seats = rebuildElementSeats(next)
    nextById.set(element.id, next)
  })

  return elements.map((element) => nextById.get(element.id) ?? element)
}
