import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clampPercentPolygon,
  clampWorldPoint,
  VENUE_WORLD_MARGIN,
} from "./venue-world-clamp"

describe("venue-world-clamp", () => {
  it("mantiene un punto interior y recorta extremos", () => {
    assert.deepEqual(clampWorldPoint({ x: 120, y: 80 }), { x: 120, y: 80 })
    assert.equal(clampWorldPoint({ x: -400, y: 20 }).x, -VENUE_WORLD_MARGIN)
    assert.equal(clampWorldPoint({ x: 20, y: 9000 }).y, 560 + VENUE_WORLD_MARGIN)
    assert.equal(clampWorldPoint({ x: 880, y: 10 }).x, 800 + VENUE_WORLD_MARGIN)
  })

  it("acota vértices de polígono en espacio canvas", () => {
    const next = clampPercentPolygon([
      { x: -50, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
    ])
    assert.ok((next[0]?.x ?? -99) > -50)
    assert.equal(next[1]?.x, 40)
    assert.equal(next[2]?.y, 40)
  })
})
