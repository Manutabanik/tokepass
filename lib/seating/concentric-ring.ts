import {
  createVenueElement,
  rebuildElementSeats,
  VENUE_SHAPE,
} from "@/lib/seating/venue-element-geometry"
import type { VenueMapElement, VenueElementType } from "@/types/venue-map"

export type RingElementKind = "round_table" | "long_table" | "vip_chair"

export type ConcentricRingConfig = {
  groupId: string
  groupName: string
  color: string
  centerX: number
  centerY: number
  startAngle: number
  endAngle: number
  innerRadius: number
  outerRadius: number
  rows: number
  rowTypes: RingElementKind[]
  countPerRow: Array<number | "auto">
  aisle: boolean
  aisleWidthDeg: number
  aisleCenterDeg: number
  price: number
}

/** Chord distance (px) between element centers along an arc. Inner rings get fewer seats. */
export const MIN_ARC_DISTANCE: Record<RingElementKind, number> = {
  round_table: 40,
  long_table: VENUE_SHAPE.longTableWidth + 8,
  vip_chair: 16,
}

const RADIAL_FOOTPRINT: Record<RingElementKind, number> = {
  round_table: VENUE_SHAPE.roundTableChairOrbit + VENUE_SHAPE.chairRadius,
  long_table: VENUE_SHAPE.longTableHeight / 2 + VENUE_SHAPE.chairRadius + 4,
  vip_chair: VENUE_SHAPE.vipChairRadius + 3,
}

const RADIAL_GAP = 8

export function dynamicAngleStepDeg(radius: number, kind: RingElementKind): number {
  const minDistance = MIN_ARC_DISTANCE[kind]
  return (minDistance / Math.max(1, radius)) * (180 / Math.PI)
}

export function polarFromUp(
  cx: number,
  cy: number,
  radius: number,
  deg: number,
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return {
    x: Math.round((cx + radius * Math.sin(rad)) * 10) / 10,
    y: Math.round((cy - radius * Math.cos(rad)) * 10) / 10,
  }
}

export function normalizeAngleSpan(start: number, end: number): {
  start: number
  end: number
} {
  let nextEnd = end
  if (nextEnd < start) nextEnd += 360
  return { start, end: nextEnd }
}

export function aisleSegments(
  startAngle: number,
  endAngle: number,
  aisle: boolean,
  aisleCenterDeg: number,
  aisleWidthDeg: number,
): Array<{ start: number; end: number }> {
  const span = normalizeAngleSpan(startAngle, endAngle)
  if (!aisle || aisleWidthDeg <= 0) {
    return [{ start: span.start, end: span.end }]
  }
  const half = aisleWidthDeg / 2
  let center = aisleCenterDeg
  while (center < span.start) center += 360
  while (center > span.end) center -= 360
  const gapStart = center - half
  const gapEnd = center + half
  const left = { start: span.start, end: Math.min(span.end, gapStart) }
  const right = { start: Math.max(span.start, gapEnd), end: span.end }
  return [left, right].filter((segment) => segment.end - segment.start > 0.5)
}

export function usableArcLength(
  radius: number,
  segments: Array<{ start: number; end: number }>,
): number {
  const deg = segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0)
  return (deg * Math.PI) / 180 * radius
}

export function autoCountForRing(
  radius: number,
  kind: RingElementKind,
  segments: Array<{ start: number; end: number }>,
): number {
  const stepDeg = dynamicAngleStepDeg(radius, kind)
  const spanDeg = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.end - segment.start),
    0,
  )
  return Math.min(240, Math.max(0, Math.floor(spanDeg / Math.max(0.5, stepDeg))))
}

function fitRingRadii(
  innerRadius: number,
  outerRadius: number,
  kinds: RingElementKind[],
): number[] {
  if (kinds.length === 0) return []
  const radii: number[] = [innerRadius]
  for (let index = 1; index < kinds.length; index += 1) {
    const prev = kinds[index - 1]!
    const kind = kinds[index]!
    const minNext =
      radii[index - 1]! + RADIAL_FOOTPRINT[prev] + RADIAL_FOOTPRINT[kind] + RADIAL_GAP
    const even = ringRadius(innerRadius, outerRadius, kinds.length, index)
    const next = Math.max(minNext, even)
    if (next > outerRadius + RADIAL_FOOTPRINT[kind]) break
    radii.push(next)
  }
  return radii
}

export function anglesAlongSegments(
  segments: Array<{ start: number; end: number }>,
  count: number,
): number[] {
  if (count <= 0 || segments.length === 0) return []
  const weights = segments.map((segment) => Math.max(0, segment.end - segment.start))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return []

  const quotas = weights.map((weight) => (weight / total) * count)
  const sizes = quotas.map((quota) => Math.floor(quota))
  let assigned = sizes.reduce((sum, size) => sum + size, 0)
  const remainders = quotas
    .map((quota, index) => ({ index, frac: quota - sizes[index]! }))
    .sort((a, b) => b.frac - a.frac)
  let cursor = 0
  while (assigned < count && cursor < remainders.length) {
    sizes[remainders[cursor]!.index] += 1
    assigned += 1
    cursor += 1
  }

  const angles: number[] = []
  segments.forEach((segment, index) => {
    const size = sizes[index] ?? 0
    if (size <= 0) return
    if (size === 1) {
      angles.push((segment.start + segment.end) / 2)
      return
    }
    const span = segment.end - segment.start
    for (let step = 0; step < size; step += 1) {
      const t = size === 1 ? 0.5 : step / (size - 1)
      angles.push(segment.start + t * span)
    }
  })
  return angles
}

function slugId(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40)
  return slug || "grada"
}

export function ringRadius(
  innerRadius: number,
  outerRadius: number,
  rows: number,
  rowIndex: number,
): number {
  if (rows <= 1) return innerRadius
  return innerRadius + (rowIndex / (rows - 1)) * (outerRadius - innerRadius)
}

export function generateConcentricRing(
  config: ConcentricRingConfig,
): VenueMapElement[] {
  const rows = Math.min(40, Math.max(1, Math.floor(config.rows) || 1))
  const inner = Math.max(20, config.innerRadius)
  const outer = Math.max(inner + 8, config.outerRadius)
  const groupId = config.groupId.trim() || `grada-${slugId(config.groupName)}`
  const groupName = config.groupName.trim() || "Grada"
  const segments = aisleSegments(
    config.startAngle,
    config.endAngle,
    config.aisle,
    config.aisleCenterDeg,
    config.aisleWidthDeg,
  )
  const elements: VenueMapElement[] = []
  const kinds: RingElementKind[] = Array.from({ length: rows }, (_, rowIndex) =>
    config.rowTypes[rowIndex] ??
    config.rowTypes[config.rowTypes.length - 1] ??
    "round_table",
  )
  const radii = fitRingRadii(inner, outer, kinds)

  for (let rowIndex = 0; rowIndex < radii.length; rowIndex += 1) {
    const kind = kinds[rowIndex]!
    const radius = radii[rowIndex]!
    const requested = config.countPerRow[rowIndex] ?? "auto"
    const maxFit = autoCountForRing(radius, kind, segments)
    if (maxFit <= 0) continue
    const count =
      requested === "auto"
        ? maxFit
        : Math.min(maxFit, Math.max(1, Math.floor(requested) || 1))
    const angles = anglesAlongSegments(segments, count)
    angles.forEach((angle, index) => {
      const point = polarFromUp(config.centerX, config.centerY, radius, angle)
      const created = createVenueElement(kind as VenueElementType, index, point)
      created.id = `${slugId(groupId)}-r${rowIndex + 1}-n${index + 1}`
      created.groupId = groupId
      created.groupName = groupName
      created.ringIndex = rowIndex
      created.rotation = angle
      created.color = config.color
      created.price = Math.max(0, config.price)
      created.sellMode = kind === "vip_chair" ? "per_seat" : "group"
      created.priceMode = kind === "vip_chair" ? "per_person" : "closed_unit"
      created.label =
        kind === "long_table"
          ? `Tablón ${String(index + 1).padStart(2, "0")}`
          : kind === "vip_chair"
            ? `Butaca ${String(index + 1).padStart(2, "0")}`
            : `Mesa ${String(index + 1).padStart(2, "0")}`
      created.seats = rebuildElementSeats(created)
      elements.push(created)
    })
  }

  return elements
}
