import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueZone } from "./adaptive-seating"
import {
  canvasPointToPercent,
  isCloseToFirstVertex,
  normalizePolygonToPercent,
  polygonFromCanvas,
  polygonLooksLikePixels,
  VENUE_PERCENT_OVERFLOW_MAX,
  polygonToCanvas,
  percentPointToCanvas,
  popPolygonDraft,
  setPolygonVertexAtCanvas,
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
    assert.equal(zone.seatingType, "GENERAL")
    assert.equal(zone.layoutType, "general")
    assert.equal(zone.rows, 1)
    assert.equal(zone.itemsPerRow, 1)
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

  it("converts a canvas draft once, including viewBox overflow", () => {
    const closed = normalizePolygonToPercent(
      polygonFromCanvas([
        { x: 80, y: 56 },
        { x: 801, y: 56 },
        { x: 801, y: 280 },
      ]),
    )
    assert.equal(closed[0]?.x, 10)
    assert.equal(closed[0]?.y, 10)
    assert.equal(closed[1]!.x > 100 && closed[1]!.x < 101, true)
    assert.deepEqual(normalizePolygonToPercent(closed), closed)
    const zone = createVenueZone(0, closed)
    assert.equal(zone.polygon[1]?.x, closed[1]?.x)
  })

  it("does not treat overflow percents as pixels on parse", () => {
    const map = parseVenueMap({
      zones: [
        {
          id: "overflow",
          name: "Zona 1",
          polygon: [
            { x: 10, y: 10 },
            { x: 110.2, y: 10 },
            { x: 110.2, y: 40 },
          ],
        },
      ],
    })
    assert.equal(map.zones[0]?.polygon[1]?.x, 110.2)
  })

  it("does not reconvert a percent polygon when a vertex overflows 140", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 145, y: 10 },
      { x: 145, y: 40 },
    ]
    assert.equal(points[1]!.x > VENUE_PERCENT_OVERFLOW_MAX, true)
    assert.equal(polygonLooksLikePixels(points), false)
    const normalized = normalizePolygonToPercent(points)
    assert.equal(normalized[1]?.x, 145)
    assert.deepEqual(normalizePolygonToPercent(normalized), normalized)
    const map = parseVenueMap({
      zones: [{ id: "overflow-140", name: "Zona", polygon: points }],
    })
    assert.equal(map.zones[0]?.polygon[1]?.x, 145)
    assert.equal(map.zones[0]?.polygonSpace, "percent")
  })

  it("never remultiplies a polygon marked as percent, even past canvas scale", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 400, y: 10 },
      { x: 400, y: 40 },
    ]
    assert.equal(polygonLooksLikePixels(points, "percent"), false)
    const normalized = normalizePolygonToPercent(points, "percent")
    assert.equal(normalized[1]?.x, 400)
    const map = parseVenueMap({
      zones: [
        {
          id: "marked",
          name: "Zona",
          polygon: points,
          polygonSpace: "percent",
        },
      ],
    })
    assert.equal(map.zones[0]?.polygon[1]?.x, 400)
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

  it("mueve un solo vértice sin transformar el polígono entero", () => {
    const polygon = [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
    ]
    const next = setPolygonVertexAtCanvas(polygon, 1, { x: 480, y: 112 })
    assert.equal(next[0]?.x, 10)
    assert.equal(next[0]?.y, 10)
    assert.equal(next[2]?.x, 40)
    assert.equal(next[2]?.y, 40)
    assert.equal(next[1]?.x, 60)
    assert.equal(next[1]?.y, 20)
    assert.deepEqual(popPolygonDraft(polygon), [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
    ])
  })

  it("scales a percent polygon independently on X and Y", () => {
    const scaled = transformPercentPolygon(
      [
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 40 },
      ],
      { type: "scale", ox: 80, oy: 56, scale: 1, scaleX: 2, scaleY: 1 },
    )
    assert.equal(scaled[0]?.x, 10)
    assert.equal(scaled[1]?.x, 70)
    assert.equal(scaled[0]?.y, 10)
  })
})
