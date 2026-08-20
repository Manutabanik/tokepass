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

export const VENUE_GRID_SIZE = 20
export const VENUE_ROTATE_SNAP_DEG = 15
export const VENUE_ZOOM_MIN = 0.25
export const VENUE_ZOOM_MAX = 3

export function clampVenueZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(VENUE_ZOOM_MAX, Math.max(VENUE_ZOOM_MIN, zoom))
}

export const VENUE_VIEW_PADDING = 16

/**
 * Camera that matches the container aspect so `preserveAspectRatio="xMidYMid meet"`
 * fills the SVG element. The 800x560 world stays centered; extra space is
 * empty canvas, not CSS letterboxing around a small viewBox.
 */
export function expandViewBoxToContainer({
  containerWidth,
  containerHeight,
  worldWidth,
  worldHeight,
  padding = VENUE_VIEW_PADDING,
}: {
  containerWidth: number
  containerHeight: number
  worldWidth: number
  worldHeight: number
  padding?: number
}): { x: number; y: number; width: number; height: number } {
  const pad = Number.isFinite(padding) && padding >= 0 ? padding : VENUE_VIEW_PADDING
  const worldW = Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth : 800
  const worldH = Number.isFinite(worldHeight) && worldHeight > 0 ? worldHeight : 560
  const safeW =
    Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : worldW
  const safeH =
    Number.isFinite(containerHeight) && containerHeight > 0 ? containerHeight : worldH
  const contentW = worldW + pad * 2
  const contentH = worldH + pad * 2
  const containerAspect = safeW / safeH
  const contentAspect = contentW / contentH
  const width =
    containerAspect >= contentAspect ? contentH * containerAspect : contentW
  const height =
    containerAspect >= contentAspect ? contentH : contentW / containerAspect
  return {
    x: (worldW - width) / 2,
    y: (worldH - height) / 2,
    width,
    height,
  }
}

/** Center the logical world in the current camera without stretching seats. */
export function fitWorldInViewBox({
  viewWidth,
  viewHeight,
  worldWidth,
  worldHeight,
  padding = VENUE_VIEW_PADDING,
}: {
  viewWidth: number
  viewHeight: number
  worldWidth: number
  worldHeight: number
  padding?: number
}): { pan: { x: number; y: number }; zoom: number } {
  const pad = Number.isFinite(padding) && padding >= 0 ? padding : VENUE_VIEW_PADDING
  const worldW = Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth : 800
  const worldH = Number.isFinite(worldHeight) && worldHeight > 0 ? worldHeight : 560
  const viewW = Number.isFinite(viewWidth) && viewWidth > 0 ? viewWidth : worldW
  const viewH = Number.isFinite(viewHeight) && viewHeight > 0 ? viewHeight : worldH
  const zoom = clampVenueZoom(
    Math.min((viewW - pad * 2) / worldW, (viewH - pad * 2) / worldH),
  )
  return {
    zoom,
    pan: {
      x: (viewW - worldW * zoom) / 2,
      y: (viewH - worldH * zoom) / 2,
    },
  }
}

export function snapToGrid(value: number, grid = VENUE_GRID_SIZE) {
  const size = grid > 0 ? grid : VENUE_GRID_SIZE
  if (!Number.isFinite(value)) return 0
  return Math.round(value / size) * size
}

export function snapAngle(deg: number, step = VENUE_ROTATE_SNAP_DEG) {
  const size = step > 0 ? step : VENUE_ROTATE_SNAP_DEG
  if (!Number.isFinite(deg)) return 0
  return Math.round(deg / size) * size
}

export function applyMoveSnap(
  dx: number,
  dy: number,
  snap: boolean,
  grid = VENUE_GRID_SIZE,
): { dx: number; dy: number } {
  if (!snap) return { dx, dy }
  return { dx: snapToGrid(dx, grid), dy: snapToGrid(dy, grid) }
}

/** Snap the group's origin (bounding-box top-left) onto the grid. */
export function applyMoveSnapFromOrigin(
  rawDx: number,
  rawDy: number,
  origin: { x: number; y: number },
  snap: boolean,
  grid = VENUE_GRID_SIZE,
): { dx: number; dy: number } {
  if (!snap) return { dx: rawDx, dy: rawDy }
  return {
    dx: snapToGrid(origin.x + rawDx, grid) - origin.x,
    dy: snapToGrid(origin.y + rawDy, grid) - origin.y,
  }
}

export function applyRotateSnap(deg: number, snap: boolean) {
  return snap ? snapAngle(deg) : deg
}

/** Keep the world point under `cursor` (SVG viewBox units) fixed while zooming. */
export function zoomTowardCursor({
  pan,
  zoom,
  nextZoom,
  cursor,
}: {
  pan: { x: number; y: number }
  zoom: number
  nextZoom: number
  cursor: { x: number; y: number }
}): { pan: { x: number; y: number }; zoom: number } {
  const safeZoom = clampVenueZoom(zoom)
  const safeNext = clampVenueZoom(nextZoom)
  const worldX = (cursor.x - pan.x) / safeZoom
  const worldY = (cursor.y - pan.y) / safeZoom
  return {
    zoom: safeNext,
    pan: {
      x: cursor.x - worldX * safeNext,
      y: cursor.y - worldY * safeNext,
    },
  }
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
      rotation: normalizeDeg(element.rotation + deltaDeg),
    }
    if (!isInfrastructureElement(next)) next.seats = rebuildElementSeats(next)
    return next
  })
}

export function boundsCenter(box: BoundsRect): { x: number; y: number } {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }
}

function normalizeDeg(deg: number) {
  return roundCoord((((deg % 360) + 360) % 360))
}

/** Mirror over the vertical axis through `center` (X). Facing right becomes left. */
export function flipElementsHorizontal(
  elements: VenueMapElement[],
  center: { x: number; y: number },
): VenueMapElement[] {
  return elements.map((element) => {
    const next = {
      ...element,
      x: roundCoord(center.x - (element.x - center.x)),
      rotation: normalizeDeg(-element.rotation),
    }
    if (!isInfrastructureElement(next)) next.seats = rebuildElementSeats(next)
    return next
  })
}

/** Mirror over the horizontal axis through `center` (Y). Facing up becomes down. */
export function flipElementsVertical(
  elements: VenueMapElement[],
  center: { x: number; y: number },
): VenueMapElement[] {
  return elements.map((element) => {
    const next = {
      ...element,
      y: roundCoord(center.y - (element.y - center.y)),
      rotation: normalizeDeg(180 - element.rotation),
    }
    if (!isInfrastructureElement(next)) next.seats = rebuildElementSeats(next)
    return next
  })
}

export function flipSelectedElements(
  elements: VenueMapElement[],
  selectedIds: string[],
  axis: "horizontal" | "vertical",
): VenueMapElement[] {
  const ids = new Set(selectedIds)
  const selected = elements.filter((item) => ids.has(item.id))
  if (selected.length === 0) return elements
  const bounds = selectionBounds(selected)
  if (!bounds) return elements
  const center = boundsCenter(bounds)
  const flipped =
    axis === "horizontal"
      ? flipElementsHorizontal(selected, center)
      : flipElementsVertical(selected, center)
  const byId = new Map(flipped.map((item) => [item.id, item]))
  return elements.map((item) => byId.get(item.id) ?? item)
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

export const ALIGN_MIN_GAP = 20

export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom"

function isHorizontalAlign(mode: AlignMode) {
  return mode === "top" || mode === "centerY" || mode === "bottom"
}

export function alignElementsWithGap(
  elements: VenueMapElement[],
  selectedIds: string[],
  mode: AlignMode,
  minGap = ALIGN_MIN_GAP,
): VenueMapElement[] {
  const idSet = new Set(selectedIds)
  const selected = elements.filter((element) => idSet.has(element.id))
  if (selected.length < 2) return elements

  const measured = selected.map((element) => {
    const box = elementAabb(element)
    return {
      id: element.id,
      element,
      box,
      width: Math.max(1, box.maxX - box.minX),
      height: Math.max(1, box.maxY - box.minY),
    }
  })
  const union = unionAabb(measured.map((item) => item.box))
  if (!union) return elements

  const horizontal = isHorizontalAlign(mode)
  const ordered = [...measured].sort((left, right) => {
    if (horizontal) {
      const dx = left.element.x - right.element.x
      return dx !== 0 ? dx : left.element.y - right.element.y
    }
    const dy = left.element.y - right.element.y
    return dy !== 0 ? dy : left.element.x - right.element.x
  })

  const nextPos = new Map<string, { x: number; y: number }>()
  const gap = Number.isFinite(minGap) ? Math.max(0, minGap) : ALIGN_MIN_GAP

  if (horizontal) {
    let cursor = ordered[0]!.box.minX
    for (const item of ordered) {
      const y =
        mode === "top"
          ? union.minY + item.height / 2
          : mode === "bottom"
            ? union.maxY - item.height / 2
            : (union.minY + union.maxY) / 2
      nextPos.set(item.id, {
        x: roundCoord(cursor + item.width / 2),
        y: roundCoord(y),
      })
      cursor += item.width + gap
    }
  } else {
    let cursor = ordered[0]!.box.minY
    for (const item of ordered) {
      const x =
        mode === "left"
          ? union.minX + item.width / 2
          : mode === "right"
            ? union.maxX - item.width / 2
            : (union.minX + union.maxX) / 2
      nextPos.set(item.id, {
        x: roundCoord(x),
        y: roundCoord(cursor + item.height / 2),
      })
      cursor += item.height + gap
    }
  }

  return elements.map((element) => {
    const pos = nextPos.get(element.id)
    if (!pos) return element
    const next = { ...element, x: pos.x, y: pos.y }
    if (!isInfrastructureElement(next)) next.seats = rebuildElementSeats(next)
    return next
  })
}

function applyElementPositions(
  elements: VenueMapElement[],
  nextPos: Map<string, { x: number; y: number }>,
): VenueMapElement[] {
  return elements.map((element) => {
    const pos = nextPos.get(element.id)
    if (!pos) return element
    const next = { ...element, x: pos.x, y: pos.y }
    if (!isInfrastructureElement(next)) next.seats = rebuildElementSeats(next)
    return next
  })
}

/** Snap selected items onto one shared center axis (average X or Y). */
export function alignSelectedToCenter(
  elements: VenueMapElement[],
  selectedIds: string[],
  axis: "x" | "y" = "y",
): VenueMapElement[] {
  const ids = new Set(selectedIds)
  const selected = elements.filter((item) => ids.has(item.id))
  if (selected.length < 2) return elements
  const center =
    selected.reduce((sum, item) => sum + (axis === "y" ? item.y : item.x), 0) /
    selected.length
  const snapped = roundCoord(center)
  const nextPos = new Map<string, { x: number; y: number }>()
  for (const item of selected) {
    nextPos.set(item.id, {
      x: axis === "x" ? snapped : item.x,
      y: axis === "y" ? snapped : item.y,
    })
  }
  return applyElementPositions(elements, nextPos)
}

/**
 * Pin the leftmost and rightmost items, then space the rest evenly on X
 * so the gap between consecutive centers is identical.
 */
export function distributeSelectedHorizontally(
  elements: VenueMapElement[],
  selectedIds: string[],
): VenueMapElement[] {
  const ids = new Set(selectedIds)
  const selected = elements.filter((item) => ids.has(item.id))
  if (selected.length < 3) return elements
  const ordered = [...selected].sort((left, right) => {
    const dx = left.x - right.x
    return dx !== 0 ? dx : left.y - right.y
  })
  const first = ordered[0]!
  const last = ordered[ordered.length - 1]!
  const span = last.x - first.x
  if (!Number.isFinite(span) || Math.abs(span) < 0.01) return elements
  const step = span / (ordered.length - 1)
  const nextPos = new Map<string, { x: number; y: number }>()
  ordered.forEach((item, index) => {
    nextPos.set(item.id, {
      x: roundCoord(first.x + step * index),
      y: item.y,
    })
  })
  return applyElementPositions(elements, nextPos)
}

export function angleAt(
  center: { x: number; y: number },
  point: { x: number; y: number },
): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI
}

/** Stem + knob placement. Flips below the box when the top would clip. */
export function rotationHandleAnchor(box: BoundsRect, zoom: number) {
  const z = Math.max(0.25, zoom)
  const lift = 36 / z
  const minTop = 12 / z
  const cx = box.x + box.width / 2
  const topY = box.y - lift
  if (topY >= minTop) {
    return { cx, cy: topY, edgeY: box.y, side: "top" as const }
  }
  return {
    cx,
    cy: box.y + box.height + lift,
    edgeY: box.y + box.height,
    side: "bottom" as const,
  }
}

/**
 * Degrees to apply from the original pointer on the handle to the current
 * pointer, so the first frame is 0 (no jump). Shift imanta a 15°.
 */
export function rotationDeltaDegrees(
  center: { x: number; y: number },
  origin: { x: number; y: number },
  current: { x: number; y: number },
  snap = false,
) {
  return rotationDeltaFromPointer(
    center,
    angleAt(center, origin),
    current,
    snap,
  )
}

export function rotationDeltaFromPointer(
  center: { x: number; y: number },
  startAngle: number,
  current: { x: number; y: number },
  snap = false,
) {
  return applyRotateSnap(angleAt(center, current) - startAngle, snap)
}
