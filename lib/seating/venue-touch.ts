import { clampVenueZoom, zoomTowardCursor } from "@/lib/seating/venue-transform"

export type TouchPoint = { x: number; y: number }

export type PinchOrigin = {
  originDistance: number
  originZoom: number
  originPan: TouchPoint
  originCursor: TouchPoint
}

const MIN_PINCH_DISTANCE = 8

export function touchDistance(a: TouchPoint, b: TouchPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function touchMidpoint(a: TouchPoint, b: TouchPoint): TouchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Empty-canvas one-finger drag: marquee on desktop, lasso-only on compact chrome. */
export function emptyCanvasDragAction(opts: {
  compactChrome: boolean
  lassoMode: boolean
}): "marquee" | "ignore" {
  if (!opts.compactChrome) return "marquee"
  return opts.lassoMode ? "marquee" : "ignore"
}

/**
 * World-unit sizes for transform knobs. Fat-finger hits stay ≥4× the visible
 * knob and map to ~48 CSS px on a typical phone canvas.
 */
export function transformHandleWorldSize(zoom: number, fatFinger: boolean) {
  const z = Math.max(0.25, zoom)
  const visual = 8 / z
  const hit = (fatFinger ? 112 : 24) / z
  return { visual, hit }
}

/** Zoom about the original pinch center, then pan by the midpoint drift. */
export function applyTwoFingerViewport({
  origin,
  currentDistance,
  currentCursor,
}: {
  origin: PinchOrigin
  currentDistance: number
  currentCursor: TouchPoint
}): { pan: TouchPoint; zoom: number } {
  const safeOriginDist = Number.isFinite(origin.originDistance)
    ? origin.originDistance
    : 0
  const ratio =
    safeOriginDist >= MIN_PINCH_DISTANCE && Number.isFinite(currentDistance)
      ? currentDistance / safeOriginDist
      : 1
  const nextZoom = clampVenueZoom(origin.originZoom * ratio)
  const zoomed = zoomTowardCursor({
    pan: origin.originPan,
    zoom: origin.originZoom,
    nextZoom,
    cursor: origin.originCursor,
  })
  const dx = currentCursor.x - origin.originCursor.x
  const dy = currentCursor.y - origin.originCursor.y
  return {
    zoom: zoomed.zoom,
    pan: {
      x: zoomed.pan.x + (Number.isFinite(dx) ? dx : 0),
      y: zoomed.pan.y + (Number.isFinite(dy) ? dy : 0),
    },
  }
}
