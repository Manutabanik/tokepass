import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueElement } from "./venue-element-geometry"
import { zoneCanvasAabb } from "./venue-map-lod"
import {
  ALIGN_MIN_GAP,
  aabbIntersects,
  aabbToRect,
  alignElementsWithGap,
  applyMoveSnap,
  applyMoveSnapFromOrigin,
  applyRotateSnap,
  bakeLiveTransform,
  elementAabb,
  scaleElements,
  selectionBounds,
  snapAngle,
  snapToGrid,
  translateElements,
  zoomTowardCursor,
} from "./venue-transform"

describe("venue-transform", () => {
  it("builds a bounding box around selected tables", () => {
    const a = createVenueElement("round_table", 0, { x: 100, y: 100 })
    const b = createVenueElement("long_table", 1, { x: 160, y: 100 })
    const bounds = selectionBounds([a, b])
    assert.equal(bounds != null, true)
    assert.equal((bounds?.width ?? 0) > 40, true)
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
})
