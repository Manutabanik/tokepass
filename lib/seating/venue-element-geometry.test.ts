import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  compactVenueElementLabel,
  createVenueElement,
  rebuildElementSeats,
  VENUE_SHAPE,
} from "./venue-element-geometry"
import { flattenVenueMapSeats, venueMapToSeatingLayout } from "./venue-map-geometry"
import { emptyVenueMap, parseVenueMap } from "@/types/venue-map"

describe("venue-element-geometry", () => {
  it("creates theatre seats at 12px, not generic table size", () => {
    const chair = createVenueElement("vip_chair", 0, { x: 40, y: 40 })
    assert.equal(chair.width, VENUE_SHAPE.theatreSeat)
    assert.equal(chair.height, VENUE_SHAPE.theatreSeat)
    assert.equal(chair.shapeType, "theatre_seat")
  })

  it("places 8 chairs around a round table", () => {
    const table = createVenueElement("round_table", 0, { x: 200, y: 150 })
    table.chairCount = 8
    table.seats = rebuildElementSeats(table)
    assert.equal(table.seats.length, 8)
    assert.equal(table.seats[0]?.id.endsWith("-S1"), true)
    assert.equal(table.width, VENUE_SHAPE.roundTableRadius * 2)
  })

  it("compacts mesa labels below 1.2x zoom", () => {
    assert.equal(compactVenueElementLabel("Mesa 01", 1), "1")
    assert.equal(compactVenueElementLabel("Tablón 09", 1.19), "9")
    assert.equal(compactVenueElementLabel("Mesa 01", 1.2), "Mesa 01")
  })

  it("serializes round tables as numbered seats for B2C", () => {
    const table = createVenueElement("round_table", 0, { x: 200, y: 150 })
    const map = emptyVenueMap()
    map.stage = null
    map.elements = [table]
    const layout = venueMapToSeatingLayout(map)
    assert.equal(layout[0]?.layout_type, "numbered_seat")
    assert.equal(layout[0]?.rows[0]?.items.length, table.seats.length)
    const flat = flattenVenueMapSeats(map)
    assert.equal(flat.length, table.seats.length)
  })

  it("serializes a standing zone as general admission", () => {
    const zone = createVenueElement("standing_zone", 0, { x: 100, y: 100 })
    zone.capacity = 40
    const map = emptyVenueMap()
    map.elements = [zone]
    const layout = venueMapToSeatingLayout(map)
    assert.equal(layout[0]?.layout_type, "general")
    assert.equal(layout[0]?.rows.length, 0)
  })

  it("parses a chair without width as a 12px theatre seat", () => {
    const map = parseVenueMap({
      version: 1,
      sectors: [],
      elements: [{ id: "c1", type: "vip_chair", label: "Silla 1", x: 10, y: 10 }],
    })
    assert.equal(map.elements[0]?.width, 12)
    assert.equal(map.elements[0]?.height, 12)
  })
})
