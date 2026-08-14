import { rotatePoint, rebuildElementSeats, VENUE_SHAPE } from "@/lib/seating/venue-element-geometry"
import { isInfrastructureElement, type VenueMapElement } from "@/types/venue-map"

export type Aabb = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type BoundsRect = {
  x: number
  y: number
  width: number
  height: number
}

export type ResizeHandle = "nw" | "ne" | "sw" | "se"

export type LiveTransform =
  | { type: "move"; dx: number; dy: number }
  | { type: "scale"; ox: number; oy: number; scale: number }
  | { type: "rotate"; cx: number; cy: number; deg: number }

function roundCoord(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10) / 10
}

export function elementVisualSize(element: VenueMapElement): {
  width: number
  height: number
} {
  const chairPad = (VENUE_SHAPE.chairRadius + 2) * 2
  if (element.type === "round_table") {
    const diameter = Math.max(16, Math.min(element.width || 28, element.height || 28))
    return { width: diameter + chairPad, height: diameter + chairPad }
  }
  if (element.type === "vip_chair") {
    const size = Math.max(12, element.width || VENUE_SHAPE.theatreSeat)
    return { width: size, height: Math.max(12, element.height || VENUE_SHAPE.theatreSeat) }
  }
  if (element.type === "long_table") {
    return {
      width: Math.max(8, element.width || 8),
      height: Math.max(8, element.height || 8) + chairPad,
    }
  }
  return {
    width: Math.max(8, element.width || 8),
    height: Math.max(8, element.height || 8),
  }
}

export function elementAabb(element: VenueMapElement): Aabb {
  const { width, height } = elementVisualSize(element)
  const hw = width / 2
  const hh = height / 2
  const corners = [
    rotatePoint(element.x - hw, element.y - hh, element.x, element.y, element.rotation),
    rotatePoint(element.x + hw, element.y - hh, element.x, element.y, element.rotation),
    rotatePoint(element.x + hw, element.y + hh, element.x, element.y, element.rotation),
    rotatePoint(element.x - hw, element.y + hh, element.x, element.y, element.rotation),
  ]
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  }
}

export function unionAabb(boxes: Aabb[]): Aabb | null {
  if (boxes.length === 0) return null
  return boxes.reduce(
    (acc, box) => ({
      minX: Math.min(acc.minX, box.minX),
      minY: Math.min(acc.minY, box.minY),
      maxX: Math.max(acc.maxX, box.maxX),
      maxY: Math.max(acc.maxY, box.maxY),
    }),
  )
}

export function aabbToRect(box: Aabb): BoundsRect {
  return {
    x: box.minX,
    y: box.minY,
    width: Math.max(1, box.maxX - box.minX),
    height: Math.max(1, box.maxY - box.minY),
  }
}

export function aabbIntersects(a: Aabb, b: Aabb): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

export function selectionBounds(elements: VenueMapElement[]): BoundsRect | null {
  const box = unionAabb(elements.map(elementAabb))
  return box ? aabbToRect(box) : null
}

export function liveTransformToSvg(live: LiveTransform | null): string | undefined {
  if (!live) return undefined
  if (live.type === "move") return `translate(${live.dx} ${live.dy})`
  if (live.type === "scale") {
    return `translate(${live.ox} ${live.oy}) scale(${live.scale}) translate(${-live.ox} ${-live.oy})`
  }
  return `rotate(${live.deg} ${live.cx} ${live.cy})`
}

export function applyLiveToRect(
  rect: BoundsRect,
  live: LiveTransform | null,
): BoundsRect {
  if (!live) return rect
  if (live.type === "move") {
    return { ...rect, x: rect.x + live.dx, y: rect.y + live.dy }
  }
  if (live.type === "scale") {
    return {
      x: live.ox + (rect.x - live.ox) * live.scale,
      y: live.oy + (rect.y - live.oy) * live.scale,
      width: rect.width * live.scale,
      height: rect.height * live.scale,
    }
  }
  const corners = [
    rotatePoint(rect.x, rect.y, live.cx, live.cy, live.deg),
    rotatePoint(rect.x + rect.width, rect.y, live.cx, live.cy, live.deg),
    rotatePoint(rect.x + rect.width, rect.y + rect.height, live.cx, live.cy, live.deg),
    rotatePoint(rect.x, rect.y + rect.height, live.cx, live.cy, live.deg),
  ]
  const box = {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  }
  return aabbToRect(box)
}

export function resizeOrigin(
  bounds: BoundsRect,
  handle: ResizeHandle,
): { x: number; y: number } {
  if (handle === "nw") return { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
  if (handle === "ne") return { x: bounds.x, y: bounds.y + bounds.height }
  if (handle === "sw") return { x: bounds.x + bounds.width, y: bounds.y }
  return { x: bounds.x, y: bounds.y }
}

export function clampScale(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(8, Math.max(0.2, value))
}

export function translateElements(
  elements: VenueMapElement[],
  dx: number,
  dy: number,
): VenueMapElement[] {
  return elements.map((element) => {
    const next = {
      ...element,
      x: roundCoord(element.x + dx),
      y: roundCoord(element.y + dy),
    }
    if (!isInfrastructureElement(next)) next.seats = rebuildElementSeats(next)
    return next
  })
}

export function scaleElements(
  elements: VenueMapElement[],
  origin: { x: number; y: number },
  scale: number,
): VenueMapElement[] {
  const safe = clampScale(scale)
  return elements.map((element) => {
    const width = Math.max(8, roundCoord(element.width * safe))
    const height =
      element.type === "round_table" || element.type === "vip_chair"
        ? width
        : Math.max(8, roundCoord(element.height * safe))
    const next = {
      ...element,
      x: roundCoord(origin.x + (element.x - origin.x) * safe),
      y: roundCoord(origin.y + (element.y - origin.y) * safe),
      width,
      height,
    }
    if (!isInfrastructureElement(next)) next.seats = rebuildElementSeats(next)
    return next
  })
}

export function rotateElementsAround(
  elements: VenueMapElement[],
  center: { x: number; y: number },
  deltaDeg: number,
): VenueMapElement[] {
  return elements.map((element) => {
    const point = rotatePoint(element.x, element.y, center.x, center.y, deltaDeg)
    const next = {
      ...element,
      x: roundCoord(point.x),
      y: roundCoord(point.y),
      rotation: roundCoord((((element.rotation + deltaDeg) % 360) + 360) % 360),
    }
    if (!isInfrastructureElement(next)) next.seats = rebuildElementSeats(next)
    return next
  })
}

export function bakeLiveTransform(
  elements: VenueMapElement[],
  live: LiveTransform,
): VenueMapElement[] {
  if (live.type === "move") return translateElements(elements, live.dx, live.dy)
  if (live.type === "scale") {
    return scaleElements(elements, { x: live.ox, y: live.oy }, live.scale)
  }
  return rotateElementsAround(elements, { x: live.cx, y: live.cy }, live.deg)
}

export function angleAt(
  center: { x: number; y: number },
  point: { x: number; y: number },
): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI
}
