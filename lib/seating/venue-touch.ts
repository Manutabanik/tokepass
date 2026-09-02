import { clampVenueZoom, zoomTowardCursor } from "@/lib/seating/venue-transform"

export type TouchPoint = { x: number; y: number }

export type PinchOrigin = {
  originDistance: number
  originZoom: number
  originPan: TouchPoint
  originCursor: TouchPoint
}

const MIN_PINCH_DISTANCE = 8

/** Screen-px slop: above this, the gesture is a pan/pinch, not a seat tap. */
export const BUYER_TAP_SLOP_PX = 10
/** Extra invisible padding around tables/chairs for fat-finger hits. */
export const BUYER_HIT_PADDING_PX = 10

export function touchDistance(a: TouchPoint, b: TouchPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export type BuyerTapSession = {
  x: number
  y: number
  pointerId: number
  fingers: number
  dragged: boolean
}

export function beginBuyerTap(
  x: number,
  y: number,
  pointerId: number,
): BuyerTapSession {
  return { x, y, pointerId, fingers: 1, dragged: false }
}

export function noteBuyerTapPointer(
  session: BuyerTapSession,
  pointerId: number,
): BuyerTapSession {
  if (pointerId === session.pointerId) return session
  return { ...session, fingers: session.fingers + 1, dragged: true }
}

export function noteBuyerTapMove(
  session: BuyerTapSession,
  x: number,
  y: number,
  slop = BUYER_TAP_SLOP_PX,
): BuyerTapSession {
  if (touchDistance(session, { x, y }) > slop) {
    return { ...session, dragged: true }
  }
  return session
}

export function isBuyerCleanTap(
  session: BuyerTapSession | null,
  end: { x: number; y: number; pointerId: number },
  slop = BUYER_TAP_SLOP_PX,
): boolean {
  if (!session) return false
  if (session.pointerId !== end.pointerId) return false
  if (session.dragged || session.fingers > 1) return false
  return touchDistance(session, end) <= slop
}

export function buyerHitPaddingWorld(
  pxPerUnit: number,
  paddingPx = BUYER_HIT_PADDING_PX,
) {
  return paddingPx / Math.max(pxPerUnit, 0.05)
}

export function hapticSelectFeedback() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(50)
    }
  } catch {
    /* algunos navegadores bloquean vibrate fuera de un gesto */
  }
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

/** Ignore the synthetic click that follows a touch after opening the sheet. */
export const SHEET_DISMISS_GUARD_MS = 150

/** Clock read for event handlers. Keep Date.now out of component bodies. */
export function nowMs() {
  return Date.now()
}

type IsolatablePointer = {
  stopPropagation?: () => void
  preventDefault?: () => void
  pointerType?: string
  cancelBubble?: boolean
  nativeEvent?: {
    stopImmediatePropagation?: () => void
    cancelBubble?: boolean
  }
}

/** Solo se registran y quitan listeners: no hace falta un EventTarget entero. */
type PassiveTouchTarget = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener"
>

/** Register touch gestures without blocking the main thread / scroll warnings. */
export function attachPassiveTouchListeners(
  el: PassiveTouchTarget,
  handlers: {
    onTouchStart?: (event: TouchEvent) => void
    onTouchMove?: (event: TouchEvent) => void
  } = {},
) {
  const onTouchStart = (event: Event) => {
    handlers.onTouchStart?.(event as TouchEvent)
  }
  const onTouchMove = (event: Event) => {
    handlers.onTouchMove?.(event as TouchEvent)
  }
  el.addEventListener("touchstart", onTouchStart, { passive: true })
  el.addEventListener("touchmove", onTouchMove, { passive: true })
  return () => {
    el.removeEventListener("touchstart", onTouchStart)
    el.removeEventListener("touchmove", onTouchMove)
  }
}

/** Keep a canvas hit from bubbling into deselect / sheet-dismiss handlers. */
export function isolateCanvasPointer(
  event: IsolatablePointer,
  options?: { preventGhostClick?: boolean },
) {
  event.stopPropagation?.()
  event.cancelBubble = true
  const native = event.nativeEvent
  if (native) {
    native.cancelBubble = true
    native.stopImmediatePropagation?.()
  }
  if (
    options?.preventGhostClick &&
    (event.pointerType === "touch" || event.pointerType === "pen")
  ) {
    event.preventDefault?.()
  }
}

export function shouldIgnoreSheetDismiss(input: {
  reason?: string | null
  nowMs: number
  guardUntilMs: number
}): boolean {
  const reason = input.reason ?? ""
  if (reason === "close-press" || reason === "escape-key") return false
  if (input.nowMs < input.guardUntilMs) return true
  return reason === "focus-out" || reason === "none" || reason === ""
}

export function isIntentionalSheetClose(reason?: string | null): boolean {
  return (
    reason === "close-press" ||
    reason === "escape-key" ||
    reason === "outside-press"
  )
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
