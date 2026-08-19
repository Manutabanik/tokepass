import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueZone } from "./adaptive-seating"
import {
  canvasPointToPercent,
  isCloseToFirstVertex,
  normalizePolygonToPercent,
  polygonLooksLikePixels,
  polygonToCanvas,
  percentPointToCanvas,
  transformPercentPolygon,
} from "./venue-polygon"
import { emptyVenueMap, parseVenueMap } from "@/types/venue-map"

describe("parametric zone polygons", () => {
  it("stores new traces as relative percents, not canvas pixels", () => {
    const zone = createVenueZone(0, [
      canvasPointToPercent({ x: 80, y: 56 }),
      canvasPointToPercent({ x: 400, y: 56 }),
      canvasPointToPercent({ x: 400, y: 280 }),
    ])
    assert.equal(polygonLooksLikePixels(zone.polygon), false)
    assert.equal(zone.polygon[0]?.x, 10)
    assert.equal(zone.polygon[0]?.y, 10)
    assert.equal(zone.rows, 4)
    assert.equal(zone.itemsPerRow, 10)
  })

  it("does not explode the map JSON into individual tables", () => {
    const map = emptyVenueMap()
    map.zones = [
      createVenueZone(0, [
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 40 },
      ]),
    ]
    assert.equal(map.elements.length, 0)
    assert.equal(map.sectors.length, 0)
    assert.equal(JSON.stringify(map.zones[0]).includes("R1-I1"), false)
    assert.ok(map.zones[0]?.polygon.length === 3)
  })

  it("normalizes legacy pixel polygons to percent on parse", () => {
    const map = parseVenueMap({
      zones: [
        {
          id: "naranja",
          name: "Sector Naranja",
          color: "#f97316",
          polygon: [
            { x: 80, y: 56 },
            { x: 400, y: 56 },
            { x: 400, y: 280 },
            { x: 80, y: 280 },
          ],
          layoutType: "table_combo",
          rows: 6,
          itemsPerRow: 12,
        },
      ],
    })
    const zone = map.zones[0]
    assert.ok(zone)
    assert.equal(polygonLooksLikePixels(zone.polygon), false)
    assert.equal(zone.polygon[0]?.x, 10)
    assert.equal(zone.polygon[0]?.y, 10)
    const canvas = polygonToCanvas(zone.polygon)
    assert.equal(canvas[0]?.x, 80)
    assert.equal(canvas[0]?.y, 56)
  })

  it("keeps already-percent polygons stable", () => {
    const points = normalizePolygonToPercent([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
    ])
    assert.equal(points[2]?.x, 90)
    assert.equal(percentPointToCanvas(points[0]!).x, 80)
  })

  it("snaps the last click to the first vertex to close the zone", () => {
    const draft = [
      { x: 100, y: 80 },
      { x: 240, y: 80 },
      { x: 240, y: 200 },
    ]
    assert.equal(isCloseToFirstVertex(draft, { x: 104, y: 82 }), true)
    assert.equal(isCloseToFirstVertex(draft, { x: 180, y: 140 }), false)
    assert.equal(isCloseToFirstVertex(draft.slice(0, 2), { x: 100, y: 80 }), false)
  })

  it("translates a percent polygon in canvas pixels via a live move", () => {
    const moved = transformPercentPolygon(
      [
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 40 },
      ],
      { type: "move", dx: 80, dy: 0 },
    )
    assert.equal(moved[0]?.x, 20)
    assert.equal(moved[0]?.y, 10)
  })
})
