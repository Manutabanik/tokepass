import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"

import {
  applyVenueMapBackgroundPatch,
  normalizeVenueMapBackgroundPatch,
} from "./venue-map-background"

describe("normalizeVenueMapBackgroundPatch", () => {
  it("returns null when the map is missing", () => {
    assert.equal(
      normalizeVenueMapBackgroundPatch(null, { backgroundOpacity: 0.5 }),
      null,
    )
    assert.equal(
      normalizeVenueMapBackgroundPatch(undefined, { backgroundScale: 1 }),
      null,
    )
  })

  it("clamps sliders and drops blank image urls", () => {
    const map = emptyVenueMap()
    assert.deepEqual(
      normalizeVenueMapBackgroundPatch(map, {
        backgroundImage: "   ",
        backgroundOpacity: 4,
        backgroundScale: 0.05,
        backgroundX: Number.NaN,
        backgroundY: 12,
      }),
      {
        backgroundImage: null,
        backgroundOpacity: 1,
        backgroundScale: 0.2,
        backgroundX: 0,
        backgroundY: 12,
      },
    )
  })
})

describe("applyVenueMapBackgroundPatch", () => {
  it("does not mutate the source map when the canvas has no instance", () => {
    assert.equal(applyVenueMapBackgroundPatch(null, { backgroundX: 10 }), null)
    const map = emptyVenueMap()
    const next = applyVenueMapBackgroundPatch(map, {
      backgroundImage: "https://cdn.example/predio.jpg",
      backgroundOpacity: 0.72,
    })
    assert.equal(map.backgroundImage, null)
    assert.equal(next?.backgroundImage, "https://cdn.example/predio.jpg")
    assert.equal(next?.backgroundOpacity, 0.72)
  })
})
