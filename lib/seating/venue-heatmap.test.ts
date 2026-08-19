import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyHeatmapColors, heatmapColor, venueMapPriceRange } from "./venue-heatmap"
import { emptyVenueMap } from "@/types/venue-map"
import { createVenueElement } from "./venue-element-geometry"

describe("venue-heatmap", () => {
  it("maps the cheapest price to green and the dearest to red", () => {
    const cheap = heatmapColor(100, { min: 100, max: 900 })
    const mid = heatmapColor(500, { min: 100, max: 900 })
    const dear = heatmapColor(900, { min: 100, max: 900 })
    assert.equal(cheap.startsWith("rgb("), true)
    assert.notEqual(cheap, dear)
    assert.notEqual(mid, cheap)
    assert.notEqual(mid, dear)
  })

  it("paints sellable items by price and dims infrastructure", () => {
    const map = emptyVenueMap()
    const cheap = createVenueElement("vip_chair", 0, { x: 40, y: 80 })
    cheap.price = 1000
    const dear = createVenueElement("vip_chair", 1, { x: 80, y: 80 })
    dear.price = 9000
    const stage = createVenueElement("infrastructure", 0, { x: 200, y: 40 }, "stage")
    map.elements = [cheap, dear, stage]
    const range = venueMapPriceRange(map)
    assert.equal(range.min, 1000)
    assert.equal(range.max, 9000)
    const painted = applyHeatmapColors(map)
    assert.notEqual(painted.elements[0]?.color, painted.elements[1]?.color)
    assert.equal((painted.elements[2]?.opacity ?? 1) <= 0.35, true)
    assert.equal(map.elements[0]?.color, cheap.color)
  })
})
