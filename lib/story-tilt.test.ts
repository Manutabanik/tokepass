import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clampStoryTilt,
  specularFromTilt,
  tiltFromOrientation,
  tiltFromPointer,
} from "@/lib/story-tilt"

describe("story tilt", () => {
  it("maps pointer position to a bounded rotateX / rotateY", () => {
    assert.deepEqual(tiltFromPointer(0, 0, 100, 200, 12), { x: 12, y: -12 })
    assert.deepEqual(tiltFromPointer(100, 200, 100, 200, 12), { x: -12, y: 12 })
    assert.deepEqual(tiltFromPointer(50, 100, 100, 200, 12), { x: 0, y: 0 })
  })

  it("clamps extreme gyroscope values", () => {
    const tilt = tiltFromOrientation(90, 90, 10)
    assert.equal(tilt.x, 10)
    assert.equal(tilt.y, 10)
  })

  it("keeps specular highlight aligned with tilt", () => {
    const glow = specularFromTilt({ x: -6, y: 8 })
    assert.equal(glow.angle > 118, true)
    assert.equal(glow.x > 50, true)
  })

  it("rejects out-of-range tilt", () => {
    assert.deepEqual(clampStoryTilt(40, -40, 12), { x: 12, y: -12 })
  })
})
