import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createVenueElement,
  rebuildElementSeats,
} from "./venue-element-geometry"
import { flattenVenueMapSeats, venueMapToSeatingLayout } from "./venue-map-geometry"
import { emptyVenueMap } from "@/types/venue-map"

describe("venue-element-geometry", () => {
  it("places 8 chairs around a round table", () => {
    const table = createVenueElement("round_table", 0, { x: 200, y: 150 })
    table.chairCount = 8
    table.seats = rebuildElementSeats(table)
    assert.equal(table.seats.length, 8)
    assert.equal(table.seats[0]?.id.endsWith("-S1"), true)
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
})
