import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyTwoFingerViewport,
  beginBuyerTap,
  BUYER_HIT_PADDING_PX,
  BUYER_TAP_SLOP_PX,
  buyerHitPaddingWorld,
  emptyCanvasDragAction,
  attachPassiveTouchListeners,
  isolateCanvasPointer,
  isBuyerCleanTap,
  isIntentionalSheetClose,
  noteBuyerTapMove,
  noteBuyerTapPointer,
  SHEET_DISMISS_GUARD_MS,
  shouldIgnoreSheetDismiss,
  touchDistance,
  touchMidpoint,
  transformHandleWorldSize,
  type PinchOrigin,
} from "./venue-touch"

function origin(partial?: Partial<PinchOrigin>): PinchOrigin {
  return {
    originDistance: 100,
    originZoom: 1,
    originPan: { x: 0, y: 0 },
    originCursor: { x: 100, y: 80 },
    ...partial,
  }
}

describe("venue-touch", () => {
  it("measures the span and midpoint between two contacts", () => {
    assert.equal(touchDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5)
    assert.deepEqual(touchMidpoint({ x: 10, y: 20 }, { x: 30, y: 40 }), {
      x: 20,
      y: 30,
    })
  })

  it("scales the canvas from the pinch center when the span changes", () => {
    const start = origin()
    const next = applyTwoFingerViewport({
      origin: start,
      currentDistance: 200,
      currentCursor: start.originCursor,
    })
    assert.equal(next.zoom, 2)
    const worldBeforeX = (start.originCursor.x - start.originPan.x) / start.originZoom
    const worldAfterX = (start.originCursor.x - next.pan.x) / next.zoom
    assert.equal(Math.abs(worldBeforeX - worldAfterX) < 1e-9, true)
  })

  it("pans when two fingers move without changing span", () => {
    const start = origin()
    const next = applyTwoFingerViewport({
      origin: start,
      currentDistance: start.originDistance,
      currentCursor: { x: 130, y: 50 },
    })
    assert.equal(next.zoom, 1)
    assert.equal(next.pan.x, 30)
    assert.equal(next.pan.y, -30)
  })

  it("ignores a collapsed pinch span so only the pan remains", () => {
    const start = origin({ originDistance: 2, originZoom: 1.4 })
    const next = applyTwoFingerViewport({
      origin: start,
      currentDistance: 80,
      currentCursor: { x: 110, y: 80 },
    })
    assert.equal(next.zoom, 1.4)
    assert.equal(next.pan.x, 10)
  })

  it("keeps marquee on desktop and requires lasso on compact chrome", () => {
    assert.equal(
      emptyCanvasDragAction({ compactChrome: false, lassoMode: false }),
      "marquee",
    )
    assert.equal(
      emptyCanvasDragAction({ compactChrome: true, lassoMode: false }),
      "ignore",
    )
    assert.equal(
      emptyCanvasDragAction({ compactChrome: true, lassoMode: true }),
      "marquee",
    )
  })

  it("builds fat-finger hits at least 3× the visible knob", () => {
    const { visual, hit } = transformHandleWorldSize(1, true)
    assert.equal(hit / visual >= 3, true)
    const tight = transformHandleWorldSize(2.5, true)
    assert.equal(tight.hit / tight.visual >= 3, true)
  })

  it("attaches touchstart and touchmove as passive listeners", () => {
    const calls: Array<{ type: string; passive?: boolean }> = []
    const target = {
      addEventListener(
        type: string,
        _handler: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) {
        calls.push({
          type,
          passive:
            typeof options === "object" && options != null
              ? options.passive
              : undefined,
        })
      },
      removeEventListener() {},
    }
    const dispose = attachPassiveTouchListeners(target)
    assert.deepEqual(calls, [
      { type: "touchstart", passive: true },
      { type: "touchmove", passive: true },
    ])
    dispose()
  })

  it("stops canvas pointer bubbling and marks cancelBubble", () => {
    let stopped = false
    let immediate = false
    const event = {
      pointerType: "touch",
      stopPropagation() {
        stopped = true
      },
      preventDefault() {},
      nativeEvent: {
        cancelBubble: false,
        stopImmediatePropagation() {
          immediate = true
        },
      },
    }
    isolateCanvasPointer(event, { preventGhostClick: true })
    assert.equal(stopped, true)
    assert.equal(immediate, true)
    assert.equal(event.nativeEvent.cancelBubble, true)
  })

  it("treats a lift within 10px as a clean tap and aborts past that slop", () => {
    const start = beginBuyerTap(100, 40, 1)
    assert.equal(BUYER_TAP_SLOP_PX, 10)
    assert.equal(
      isBuyerCleanTap(start, { x: 106, y: 48, pointerId: 1 }),
      true,
    )
    assert.equal(
      isBuyerCleanTap(start, { x: 110, y: 40, pointerId: 1 }),
      true,
    )
    assert.equal(
      isBuyerCleanTap(start, { x: 111, y: 40, pointerId: 1 }),
      false,
    )
    const dragged = noteBuyerTapMove(start, 111, 40)
    assert.equal(dragged.dragged, true)
    assert.equal(
      isBuyerCleanTap(dragged, { x: 111, y: 40, pointerId: 1 }),
      false,
    )
  })

  it("aborts the tap when a second finger joins (pinch)", () => {
    const start = beginBuyerTap(10, 10, 1)
    const pinched = noteBuyerTapPointer(start, 2)
    assert.equal(pinched.fingers > 1, true)
    assert.equal(
      isBuyerCleanTap(pinched, { x: 10, y: 10, pointerId: 1 }),
      false,
    )
    assert.equal(isBuyerCleanTap(null, { x: 10, y: 10, pointerId: 1 }), false)
    assert.equal(
      isBuyerCleanTap(start, { x: 10, y: 10, pointerId: 99 }),
      false,
    )
  })

  it("converts 10px of hit padding into world units", () => {
    assert.equal(BUYER_HIT_PADDING_PX, 10)
    assert.equal(buyerHitPaddingWorld(1), 10)
    assert.equal(buyerHitPaddingWorld(2), 5)
  })

  it("ignores ghost outside-press during the 150ms guard", () => {
    const openedAt = 1_000
    const guardUntil = openedAt + SHEET_DISMISS_GUARD_MS
    assert.equal(
      shouldIgnoreSheetDismiss({
        reason: "outside-press",
        nowMs: openedAt + 20,
        guardUntilMs: guardUntil,
      }),
      true,
    )
    assert.equal(
      shouldIgnoreSheetDismiss({
        reason: "focus-out",
        nowMs: openedAt + 20,
        guardUntilMs: guardUntil,
      }),
      true,
    )
    assert.equal(
      shouldIgnoreSheetDismiss({
        reason: "close-press",
        nowMs: openedAt + 20,
        guardUntilMs: guardUntil,
      }),
      false,
    )
    assert.equal(
      shouldIgnoreSheetDismiss({
        reason: "outside-press",
        nowMs: guardUntil + 1,
        guardUntilMs: guardUntil,
      }),
      false,
    )
    assert.equal(isIntentionalSheetClose("outside-press"), true)
    assert.equal(isIntentionalSheetClose("focus-out"), false)
  })
})
