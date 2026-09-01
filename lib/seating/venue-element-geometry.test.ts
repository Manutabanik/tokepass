import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  compactVenueElementLabel,
  semanticMapLabelScale,
  createVenueElement,
  explodeVenueSectorToChairs,
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

  it("asigna zoneId al crear un asiento o mesa", () => {
    const table = createVenueElement(
      "round_table",
      0,
      { x: 80, y: 80 },
      undefined,
      { zoneId: "zona-vip" },
    )
    assert.equal(table.zoneId, "zona-vip")
  })

  it("places 8 chairs around a round table", () => {
    const table = createVenueElement("round_table", 0, { x: 200, y: 150 })
    table.chairCount = 8
    table.seats = rebuildElementSeats(table)
    assert.equal(table.seats.length, 8)
    assert.equal(table.seats[0]?.id.endsWith("-S1"), true)
    assert.equal(table.width, VENUE_SHAPE.roundTableRadius * 2)
  })

  it("keeps descriptive mesa labels at overview zoom", () => {
    assert.equal(compactVenueElementLabel("Mesa 01", 0.5), "Mesa 01")
    assert.equal(compactVenueElementLabel("Tablón 09", 1), "Tablón 09")
    assert.equal(compactVenueElementLabel("Mesa 01", 2), "1")
  })

  it("scales labels up when the camera is zoomed out", () => {
    assert.ok(semanticMapLabelScale(0.5) > semanticMapLabelScale(1))
    assert.equal(semanticMapLabelScale(1), 1)
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

  it("preserves custom_label and ticket_type_id through parse", () => {
    const map = parseVenueMap({
      version: 1,
      sectors: [],
      elements: [
        {
          id: "mesa-1",
          type: "round_table",
          label: "Mesa 1",
          custom_label: "Mesa VIP Escenario 1",
          ticket_type_id: "tier-vip",
          x: 10,
          y: 10,
          seats: [
            {
              id: "mesa-1-S1",
              number: 1,
              custom_label: "Silla Preferencial VIP A",
            },
          ],
        },
      ],
    })
    assert.equal(map.elements[0]?.customLabel, "Mesa VIP Escenario 1")
    assert.equal(map.elements[0]?.ticketTypeId, "tier-vip")
    assert.equal(
      map.elements[0]?.seats[0]?.customLabel,
      "Silla Preferencial VIP A",
    )
  })

  it("preserves a locked seating label through parse", () => {
    const map = parseVenueMap({
      version: 1,
      sectors: [],
      elements: [
        {
          id: "c1",
          type: "vip_chair",
          label: "Silla de Ruedas",
          x: 10,
          y: 10,
          labelLocked: true,
        },
      ],
    })
    assert.equal(map.elements[0]?.label, "Silla de Ruedas")
    assert.equal(map.elements[0]?.labelLocked, true)
  })

  it("maps sold and locked seat statuses to blocked", () => {
    const map = parseVenueMap({
      version: 1,
      sectors: [],
      elements: [
        {
          id: "mesa-1",
          type: "round_table",
          label: "Mesa 1",
          x: 10,
          y: 10,
          seats: [
            { id: "s-sold", number: 1, status: "sold" },
            { id: "s-locked", number: 2, status: "locked" },
            { id: "s-reserved", number: 3, status: "reserved" },
          ],
        },
      ],
    })
    assert.equal(map.elements[0]?.seats[0]?.status, "blocked")
    assert.equal(map.elements[0]?.seats[1]?.status, "blocked")
    assert.equal(map.elements[0]?.seats[2]?.status, "reserved")
  })

  it("preserves a locked position through parse", () => {
    const map = parseVenueMap({
      version: 1,
      sectors: [],
      elements: [
        {
          id: "c1",
          type: "vip_chair",
          label: "Silla 1",
          x: 10,
          y: 10,
          isLocked: true,
        },
      ],
    })
    assert.equal(map.elements[0]?.isLocked, true)
  })

  it("explota una grada en butacas sin perder fila, numero ni coordenadas", () => {
    const chairs = explodeVenueSectorToChairs({
      id: "pullman",
      name: "PULLMAN",
      color: "#22d3ee",
      price: 12000,
      x: 40,
      y: 80,
      rows: 2,
      seatsPerRow: 2,
      curvature: 0,
      aisle: false,
      seats: [
        {
          id: "s-1",
          row: "3",
          number: 14,
          x: 120,
          y: 160,
          status: "available",
        },
        {
          id: "s-2",
          row: "3",
          number: 15,
          x: 136,
          y: 160,
          status: "reserved",
          price: 15000,
        },
      ],
    })
    assert.equal(chairs.length, 2)
    assert.equal(chairs[0]?.x, 120)
    assert.equal(chairs[0]?.y, 160)
    assert.equal(chairs[0]?.label, "Fila 3 - Asiento 14")
    assert.equal(chairs[0]?.price, 12000)
    assert.equal(chairs[1]?.price, 15000)
    assert.equal(chairs[1]?.seats[0]?.status, "reserved")
  })
})
