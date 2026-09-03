import { applyAutoNumbering } from "@/lib/seating/auto-numbering"
import { polarFromUp } from "@/lib/seating/concentric-ring"
import {
  createVenueElement,
  rebuildElementSeats,
  VENUE_SHAPE,
} from "@/lib/seating/venue-element-geometry"
import type { VenueMapElement } from "@/types/venue-map"

export type GridArrayKind = "vip_chair" | "round_table" | "long_table"

export const GRID_ARRAY_MAX_ITEMS = 800

/** Paso cómodo entre centros: por debajo de esto las piezas se pisan. */
export const GRID_ARRAY_BASE_PITCH: Record<GridArrayKind, { x: number; y: number }> = {
  vip_chair: { x: VENUE_SHAPE.theatreSeat + 6, y: VENUE_SHAPE.theatreSeat + 8 },
  round_table: { x: 56, y: 56 },
  long_table: { x: VENUE_SHAPE.longTableWidth + 12, y: VENUE_SHAPE.longTableHeight + 16 },
}

/** Caja dibujada sobre el lienzo, en píxeles de canvas. */
export type GridArrayArea = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type GridArrayConfig = {
  type: GridArrayKind
  rows: number
  columns: number
  /** Toda matriz nace de un área dibujada en el lienzo. */
  area: GridArrayArea
  color?: string
  groupName?: string
  price?: number
  /** Cuántas piezas del tipo ya hay en el plano, para no repetir el nombre interno. */
  labelOffset?: number
}

/** Nombrado opcional del bloque: sin prefijo, las piezas quedan sin etiqueta. */
export type GridArrayNaming = {
  prefix: string
  start: number
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

/**
 * Paso entre centros. Cada pieza ocupa una celda del área y queda en su centro,
 * así ninguna se pasa del borde que marcó el organizador.
 */
export function gridArrayPitch(config: {
  rows: number
  columns: number
  area: GridArrayArea
}): { x: number; y: number } {
  const { rows, columns } = clampGridArraySize(config.rows, config.columns)
  const width = Math.max(0, config.area.maxX - config.area.minX)
  const height = Math.max(0, config.area.maxY - config.area.minY)
  return {
    x: Math.max(1, width / columns),
    y: Math.max(1, height / rows),
  }
}

/** Con esa densidad las piezas se pisan: el área es chica para tantas filas. */
export function gridArrayPiecesOverlap(
  type: GridArrayKind,
  pitch: { x: number; y: number },
): boolean {
  const base = GRID_ARRAY_BASE_PITCH[type]
  return pitch.x < base.x - 4 || pitch.y < base.y - 4
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
  const kind = config.type
  const { x: pitchX, y: pitchY } = gridArrayPitch(config)
  const originX = config.area.minX + pitchX / 2
  const originY = config.area.minY + pitchY / 2
  const groupName = (config.groupName ?? "Bloque").trim() || "Bloque"
  const groupId = `grid-${slugGroupId(groupName)}-${crypto.randomUUID().slice(0, 8)}`
  const color = config.color?.trim() || "#f97316"
  const price = Math.max(0, Number(config.price) || 0)
  const labelOffset = Math.max(0, Math.floor(config.labelOffset ?? 0))
  const elements: VenueMapElement[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const index = row * columns + col
      const point = {
        x: Math.round((originX + col * pitchX) * 10) / 10,
        y: Math.round((originY + row * pitchY) * 10) / 10,
      }
      const created = createVenueElement(kind, labelOffset + index, point)
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

/**
 * Un prefijo se pega al número con un espacio, salvo que el organizador ya haya
 * escrito su propio separador: "Mesa" → "Mesa 1", pero "M-" → "M-1".
 */
function joinLabelPrefix(prefix: string): string {
  const trimmed = prefix.trim()
  if (!trimmed) return ""
  return /[\s\-_./:#]$/.test(prefix) ? prefix : `${trimmed} `
}

/** Nombre que llevará la pieza `index` (0-based) del bloque. Vacío = sin nombre. */
export function gridArrayLabelAt(
  naming: GridArrayNaming,
  index: number,
): string {
  const prefix = joinLabelPrefix(naming.prefix)
  if (!prefix) return ""
  const start = Math.max(1, Math.floor(naming.start) || 1)
  return `${prefix}${start + index}`
}

/**
 * Nombra el bloque de izquierda a derecha y de arriba abajo (`ringIndex` guarda
 * la fila, así que `direction: "ltr"` alcanza).
 *
 * Sin prefijo las piezas quedan **sin etiqueta en el plano**, no sin nombre: el
 * nombre por defecto se conserva porque el boleto, el manifiesto de la puerta y
 * `normalizeSeatingLayout()` lo necesitan; solo se marca `hideLabel`.
 */
export function nameGridArray(
  elements: VenueMapElement[],
  naming: GridArrayNaming,
): VenueMapElement[] {
  const prefix = joinLabelPrefix(naming.prefix)
  if (!prefix) {
    return elements.map((element) => ({ ...element, hideLabel: true }))
  }
  return applyAutoNumbering(
    elements,
    new Set(elements.map((element) => element.id)),
    {
      start: Math.max(1, Math.floor(naming.start) || 1),
      prefix,
      suffix: "",
      direction: "ltr",
      // Sin relleno de ceros: "Mesa 1", no "Mesa 01".
      pad: 1,
    },
  )
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
