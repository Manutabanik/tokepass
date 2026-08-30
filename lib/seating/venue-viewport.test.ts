import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fallbackWorldCenter, worldPointFromViewBox } from "./venue-viewport"

describe("venue-viewport", () => {
  it("falls back to the canvas midpoint", () => {
    assert.deepEqual(fallbackWorldCenter(800, 600), { x: 400, y: 300 })
  })

  it("maps the visible center through pan and zoom", () => {
    assert.deepEqual(
      worldPointFromViewBox({ x: 400, y: 300 }, { x: 0, y: 0 }, 1),
      { x: 400, y: 300 },
    )
    assert.deepEqual(
      worldPointFromViewBox({ x: 400, y: 300 }, { x: 0, y: 0 }, 2),
      { x: 200, y: 150 },
    )
    assert.deepEqual(
      worldPointFromViewBox({ x: 400, y: 300 }, { x: 40, y: -20 }, 1),
      { x: 360, y: 320 },
    )
  })
})
