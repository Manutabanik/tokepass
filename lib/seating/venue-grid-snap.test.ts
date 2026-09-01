import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  magneticSnapActive,
  snapPointToGrid,
  VENUE_GRID_SIZE,
} from "./venue-grid-snap"

describe("venue-grid-snap", () => {
  it("usa una grilla de 20px", () => {
    assert.equal(VENUE_GRID_SIZE, 20)
  })

  it("Shift invierte la atracción magnética", () => {
    assert.equal(magneticSnapActive(true, false), true)
    assert.equal(magneticSnapActive(true, true), false)
    assert.equal(magneticSnapActive(false, false), false)
    assert.equal(magneticSnapActive(false, true), true)
  })

  it("snapea un punto al grid o lo deja libre", () => {
    assert.deepEqual(snapPointToGrid({ x: 27, y: 11 }, true), { x: 20, y: 20 })
    assert.deepEqual(snapPointToGrid({ x: 27, y: 11 }, false), { x: 27, y: 11 })
  })
})
