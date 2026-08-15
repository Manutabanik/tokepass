import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueElement } from "./venue-element-geometry"
import {
  ALIGN_MIN_GAP,
  aabbIntersects,
  alignElementsWithGap,
  bakeLiveTransform,
  elementAabb,
  scaleElements,
  selectionBounds,
  translateElements,
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
})
