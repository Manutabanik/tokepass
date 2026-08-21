import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueElement } from "./venue-element-geometry"
import { zoneCanvasAabb } from "./venue-map-lod"
import {
  ALIGN_MIN_GAP,
  aabbIntersects,
  aabbToRect,
  alignElementsWithGap,
  alignSelectedToCenter,
  distributeSelectedHorizontally,
  applyMoveSnap,
  applyMoveSnapFromOrigin,
  applyRotateSnap,
  bakeLiveTransform,
  flipSelectedElements,
  rotateElementsAround,
  rotationDeltaDegrees,
  rotationHandleAnchor,
  elementAabb,
  scaleElements,
  selectionBounds,
  snapAngle,
  snapToGrid,
  translateElements,
  zoomTowardCursor,
  expandViewBoxToContainer,
  fitViewportToWorldBox,
  fitWorldInViewBox,
  applyLiveToSeats,
  applyLiveToStage,
  handlePoint,
  liveScaleAxes,
  pointsToBounds,
  rectAabb,
  scaleFromHandlePointer,
} from "./venue-transform"

describe("venue-transform", () => {
  it("builds a bounding box around selected tables", () => {
    const a = createVenueElement("round_table", 0, { x: 100, y: 100 })
    const b = createVenueElement("long_table", 1, { x: 160, y: 100 })
    const bounds = selectionBounds([a, b])
    assert.equal(bounds != null, true)
    assert.equal((bounds?.width ?? 0) > 40, true)
  })

  it("orbits a multi-select around the bounding-box center and adds the angle", () => {
    const a = createVenueElement("vip_chair", 0, { x: 80, y: 100 })
    const b = createVenueElement("vip_chair", 1, { x: 120, y: 100 })
    a.rotation = 0
    b.rotation = 15
    const turned = rotateElementsAround([a, b], { x: 100, y: 100 }, 180)
    assert.equal(turned[0]!.x, 120)
    assert.equal(turned[0]!.y, 100)
    assert.equal(turned[1]!.x, 80)
    assert.equal(turned[1]!.y, 100)
    assert.equal(turned[0]!.rotation, 180)
    assert.equal(turned[1]!.rotation, 195)
  })

  it("mirrors a pair across the selection center on each axis", () => {
    const a = createVenueElement("vip_chair", 0, { x: 80, y: 90 })
    const b = createVenueElement("vip_chair", 1, { x: 120, y: 110 })
    a.rotation = 90
    b.rotation = 90
    const horizontal = flipSelectedElements([a, b], [a.id, b.id], "horizontal")
    assert.equal(horizontal[0]!.x, 120)
    assert.equal(horizontal[0]!.y, 90)
    assert.equal(horizontal[1]!.x, 80)
    assert.equal(horizontal[0]!.rotation, 270)
    const vertical = flipSelectedElements([a, b], [a.id, b.id], "vertical")
    assert.equal(vertical[0]!.y, 110)
    assert.equal(vertical[1]!.y, 90)
    assert.equal(vertical[0]!.x, 80)
    assert.equal(vertical[0]!.rotation, 90)
  })

  it("keeps relative offsets when translating a group", () => {
    const a = createVenueElement("round_table", 0, { x: 40, y: 50 })
    const b = createVenueElement("round_table", 1, { x: 80, y: 90 })
    const moved = translateElements([a, b], 10, -5)
    assert.equal(moved[0]?.x, 50)
    assert.equal(moved[0]?.y, 45)
    assert.equal(moved[1]?.x - moved[0]!.x, 40)
    assert.equal(moved[1]?.y - moved[0]!.y, 40)
  })

  it("scales X and Y independently from a corner handle", () => {
    const next = scaleFromHandlePointer({
      handle: "se",
      origin: { x: 0, y: 0 },
      startCorner: { x: 100, y: 50 },
      point: { x: 200, y: 100 },
    })
    assert.equal(next.scaleX, 2)
    assert.equal(next.scaleY, 2)
    const stretch = scaleFromHandlePointer({
      handle: "e",
      origin: { x: 0, y: 25 },
      startCorner: { x: 100, y: 25 },
      point: { x: 160, y: 80 },
    })
    assert.equal(stretch.scaleX, 1.6)
    assert.equal(stretch.scaleY, 1)
  })

  it("resizes the default stage rect without inventing extra map keys", () => {
    const stage = applyLiveToStage(
      { label: "ESCENARIO", x: 200, y: 24, width: 400, height: 48 },
      { type: "scale", ox: 200, oy: 24, scale: 1, scaleX: 0.5, scaleY: 2 },
    )
    assert.equal(stage.x, 200)
    assert.equal(stage.y, 24)
    assert.equal(stage.width, 200)
    assert.equal(stage.height, 96)
    assert.equal(stage.label, "ESCENARIO")
  })

  it("reads independent scale axes from a live transform", () => {
    const axes = liveScaleAxes({
      type: "scale",
      ox: 0,
      oy: 0,
      scale: 1.2,
      scaleX: 2,
      scaleY: 0.5,
    })
    assert.equal(axes.sx, 2)
    assert.equal(axes.sy, 0.5)
    assert.equal(handlePoint({ x: 10, y: 20, width: 40, height: 10 }, "e").x, 50)
    assert.equal(rectAabb({ x: 0, y: 0, width: 20, height: 10 }).maxX, 20)
  })

  it("scales from an origin without collapsing size", () => {
    const table = createVenueElement("long_table", 0, { x: 100, y: 80 })
    const scaled = scaleElements([table], { x: 0, y: 0 }, 2)
    assert.equal(scaled[0]!.width, table.width * 2)
    assert.equal(scaled[0]!.x, 200)
  })

  it("bakes a live rotate into finite json-safe numbers", () => {
    const table = createVenueElement("long_table", 0, { x: 120, y: 80 })
    table.rotation = 0
    const baked = bakeLiveTransform([table], {
      type: "rotate",
      cx: 100,
      cy: 80,
      deg: 90,
    })
    assert.equal(Number.isFinite(baked[0]!.x), true)
    assert.equal(Number.isFinite(baked[0]!.y), true)
    assert.equal(Number.isFinite(baked[0]!.rotation), true)
    assert.equal(JSON.stringify(baked).includes("NaN"), false)
  })

  it("bakes a live scale into finite json-safe numbers", () => {
    const table = createVenueElement("round_table", 0, { x: 80, y: 80 })
    const baked = bakeLiveTransform([table], {
      type: "scale",
      ox: 40,
      oy: 40,
      scale: 1.7,
    })
    assert.equal(Number.isFinite(baked[0]!.width), true)
    assert.equal(Number.isFinite(baked[0]!.x), true)
    assert.equal(JSON.stringify(baked).includes("NaN"), false)
  })

  it("detects marquee intersection against element bounds", () => {
    const table = createVenueElement("round_table", 0, { x: 100, y: 100 })
    const hit = aabbIntersects(elementAabb(table), {
      minX: 90,
      minY: 90,
      maxX: 110,
      maxY: 110,
    })
    const miss = aabbIntersects(elementAabb(table), {
      minX: 400,
      minY: 400,
      maxX: 420,
      maxY: 420,
    })
    assert.equal(hit, true)
    assert.equal(miss, false)
  })

  it("detects marquee intersection against parametric zones", () => {
    const box = zoneCanvasAabb({
      polygon: [
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 40 },
        { x: 10, y: 40 },
      ],
    })
    assert.ok(box)
    const hit = aabbIntersects(box, {
      minX: 70,
      minY: 50,
      maxX: 120,
      maxY: 90,
    })
    const miss = aabbIntersects(box, {
      minX: 400,
      minY: 400,
      maxX: 420,
      maxY: 420,
    })
    assert.equal(hit, true)
    assert.equal(miss, false)
    assert.equal(aabbToRect(box).width > 0, true)
  })

  it("alinea al centro sin superponer, con gap minimo", () => {
    const a = createVenueElement("round_table", 0, { x: 100, y: 100 })
    const b = createVenueElement("round_table", 1, { x: 108, y: 102 })
    const c = createVenueElement("round_table", 2, { x: 104, y: 98 })
    const next = alignElementsWithGap([a, b, c], [a.id, b.id, c.id], "centerX")
    const boxes = next.map((item) => elementAabb(item))
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        assert.equal(aabbIntersects(boxes[i]!, boxes[j]!), false)
        const gap = boxes[j]!.minY - boxes[i]!.maxY
        const reverse = boxes[i]!.minY - boxes[j]!.maxY
        assert.equal(Math.max(gap, reverse) >= ALIGN_MIN_GAP - 0.2, true)
      }
    }
    const xs = next.map((item) => item.x)
    assert.equal(Math.max(...xs) - Math.min(...xs) < 1, true)
  })

  it("alinea al medio y empaqueta en X usando el ancho rotado", () => {
    const a = createVenueElement("long_table", 0, { x: 80, y: 120 })
    const b = createVenueElement("long_table", 1, { x: 90, y: 130 })
    a.rotation = 90
    b.rotation = 90
    const next = alignElementsWithGap([a, b], [a.id, b.id], "centerY")
    const boxA = elementAabb(next[0]!)
    const boxB = elementAabb(next[1]!)
    assert.equal(aabbIntersects(boxA, boxB), false)
    const ordered = [boxA, boxB].sort((left, right) => left.minX - right.minX)
    assert.equal(ordered[1]!.minX - ordered[0]!.maxX >= ALIGN_MIN_GAP - 0.2, true)
    assert.equal(Math.abs(next[0]!.y - next[1]!.y) < 1, true)
  })

  it("aligns selected elements onto the average Y axis", () => {
    const a = createVenueElement("vip_chair", 0, { x: 80, y: 90 })
    const b = createVenueElement("vip_chair", 1, { x: 140, y: 110 })
    const next = alignSelectedToCenter([a, b], [a.id, b.id], "y")
    assert.equal(next[0]!.y, 100)
    assert.equal(next[1]!.y, 100)
    assert.equal(next[0]!.x, 80)
    assert.equal(next[1]!.x, 140)
  })

  it("distributes intermediate X while pinning first and last", () => {
    const a = createVenueElement("vip_chair", 0, { x: 0, y: 40 })
    const b = createVenueElement("vip_chair", 1, { x: 12, y: 55 })
    const c = createVenueElement("vip_chair", 2, { x: 90, y: 48 })
    const next = distributeSelectedHorizontally([a, b, c], [a.id, b.id, c.id])
    assert.equal(next[0]!.x, 0)
    assert.equal(next[2]!.x, 90)
    assert.equal(next[1]!.x, 45)
    assert.equal(next[1]!.y, 55)
  })

  it("snaps translation to the canvas grid and rotation to 15 degrees", () => {
    assert.equal(snapToGrid(27), 20)
    assert.equal(snapToGrid(31), 40)
    assert.equal(snapAngle(22), 15)
    assert.equal(snapAngle(23), 30)
    assert.deepEqual(applyMoveSnap(27, 11, true), { dx: 20, dy: 20 })
    assert.deepEqual(applyMoveSnap(27, 11, false), { dx: 27, dy: 11 })
    assert.deepEqual(
      applyMoveSnapFromOrigin(12, 8, { x: 10, y: 10 }, true),
      { dx: 10, dy: 10 },
    )
    assert.equal(applyRotateSnap(22, true), 15)
    assert.equal(applyRotateSnap(22, false), 22)
  })

  it("keeps rotation at 0 while the pointer stays on the handle", () => {
    const center = { x: 100, y: 80 }
    const handle = { x: 100, y: 40 }
    assert.equal(rotationDeltaDegrees(center, handle, handle), 0)
  })

  it("follows a quarter turn around the bounding-box center", () => {
    const center = { x: 0, y: 0 }
    const origin = { x: 0, y: -10 }
    const current = { x: 10, y: 0 }
    assert.equal(Math.round(rotationDeltaDegrees(center, origin, current)), 90)
  })

  it("snaps the live angle to the nearest 15 degrees while Shift is held", () => {
    const center = { x: 0, y: 0 }
    const origin = { x: 10, y: 0 }
    const current = { x: 10, y: 3 }
    assert.equal(rotationDeltaDegrees(center, origin, current, true), 15)
    assert.equal(rotationDeltaDegrees(center, origin, current, false) > 15, true)
  })

  it("drops the rotate handle below the box when the top stem would clip", () => {
    const tight = rotationHandleAnchor({ x: 20, y: 0, width: 40, height: 24 }, 1)
    assert.equal(tight.side, "bottom")
    const roomy = rotationHandleAnchor({ x: 20, y: 80, width: 40, height: 24 }, 1)
    assert.equal(roomy.side, "top")
  })

  it("keeps the world point under the cursor stable when zooming", () => {
    const pan = { x: 10, y: 20 }
    const zoom = 1
    const cursor = { x: 100, y: 80 }
    const next = zoomTowardCursor({ pan, zoom, nextZoom: 2, cursor })
    const worldBeforeX = (cursor.x - pan.x) / zoom
    const worldBeforeY = (cursor.y - pan.y) / zoom
    const worldAfterX = (cursor.x - next.pan.x) / next.zoom
    const worldAfterY = (cursor.y - next.pan.y) / next.zoom
    assert.equal(Math.abs(worldBeforeX - worldAfterX) < 1e-9, true)
    assert.equal(Math.abs(worldBeforeY - worldAfterY) < 1e-9, true)
  })

  it("expands the camera to the container aspect so meet has no letterbox", () => {
    const wide = expandViewBoxToContainer({
      containerWidth: 1600,
      containerHeight: 560,
      worldWidth: 800,
      worldHeight: 560,
      padding: 0,
    })
    assert.equal(Math.abs(wide.width / wide.height - 1600 / 560) < 1e-9, true)
    assert.equal(wide.height, 560)
    assert.equal(wide.width, 1600)
    assert.equal(wide.x, (800 - 1600) / 2)
    assert.equal(wide.y, 0)

    const tall = expandViewBoxToContainer({
      containerWidth: 800,
      containerHeight: 900,
      worldWidth: 800,
      worldHeight: 560,
      padding: 0,
    })
    assert.equal(Math.abs(tall.width / tall.height - 800 / 900) < 1e-9, true)
    assert.equal(tall.width, 800)
    assert.equal(tall.x, 0)
  })

  it("falls back to the logical world when the container size is invalid", () => {
    const box = expandViewBoxToContainer({
      containerWidth: 0,
      containerHeight: -4,
      worldWidth: 800,
      worldHeight: 560,
      padding: 0,
    })
    assert.equal(box.width, 800)
    assert.equal(box.height, 560)
    assert.equal(box.x, 0)
    assert.equal(box.y, 0)
  })

  it("fits the 800x560 world inside the current camera without stretching", () => {
    const fitted = fitWorldInViewBox({
      viewWidth: 1200,
      viewHeight: 560,
      worldWidth: 800,
      worldHeight: 560,
      padding: 0,
    })
    assert.equal(fitted.zoom, 1)
    assert.equal(fitted.pan.x, 200)
    assert.equal(fitted.pan.y, 0)
  })

  it("centers a world AABB in the current viewBox", () => {
    const fitted = fitViewportToWorldBox({
      box: { minX: 100, minY: 100, maxX: 300, maxY: 200 },
      viewBox: { x: 0, y: 0, width: 800, height: 560 },
      padding: 0,
    })
    assert.equal(fitted.zoom, 3)
    assert.equal(fitted.pan.x, -200)
    assert.equal(fitted.pan.y, -170)
  })

  it("builds a padded box around selected seats", () => {
    const box = pointsToBounds(
      [
        { x: 100, y: 80 },
        { x: 140, y: 80 },
      ],
      8,
    )
    assert.ok(box)
    assert.equal(box?.x, 92)
    assert.equal(box?.width, 56)
  })

  it("orbits seats around the group center and adds the angle", () => {
    const next = applyLiveToSeats(
      [
        { x: 80, y: 100, rotation: 0 },
        { x: 120, y: 100, rotation: 15 },
      ],
      { type: "rotate", cx: 100, cy: 100, deg: 180 },
    )
    assert.equal(next[0]!.x, 120)
    assert.equal(next[0]!.y, 100)
    assert.equal(next[0]!.rotation, 180)
    assert.equal(next[1]!.x, 80)
    assert.equal(next[1]!.rotation, 195)
  })
})
