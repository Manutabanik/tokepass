import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  aestheticChairGeometry,
  compactVenueElementLabel,
  semanticMapLabelScale,
  createVenueElement,
  elementCapacity,
  elementCapacityPatch,
  elementCapacityRange,
  explodeVenueSectorToChairs,
  isClosedBlockElement,
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

  it("keeps drawn chairs and declared capacity in sync on a round table", () => {
    const table = createVenueElement("round_table", 0, { x: 200, y: 150 })
    const patched = { ...table, ...elementCapacityPatch(table, 10) }
    patched.seats = rebuildElementSeats(patched)

    assert.equal(patched.capacity, 10)
    assert.equal(patched.chairCount, 10)
    assert.equal(patched.seats.length, 10)
    assert.equal(elementCapacity(patched), 10)
  })

  it("spreads a long table's capacity across both sides", () => {
    const table = createVenueElement("long_table", 0, { x: 100, y: 100 })
    const patched = { ...table, ...elementCapacityPatch(table, 9) }
    patched.seats = rebuildElementSeats(patched)

    assert.equal(patched.sideA + patched.sideB, 9)
    assert.equal(patched.seats.length, 9)
    assert.equal(elementCapacity(patched), 9)
  })

  it("keeps a one-sided long table one-sided while the capacity still fits", () => {
    const table = createVenueElement("long_table", 0, { x: 100, y: 100 })
    const oneSided = { ...table, sideA: 4, sideB: 0 }
    const patched = { ...oneSided, ...elementCapacityPatch(oneSided, 6) }
    patched.seats = rebuildElementSeats(patched)

    assert.equal(patched.sideA, 6)
    assert.equal(patched.sideB, 0)
    assert.equal(patched.seats.length, 6)
  })

  it("never lets capacity exceed the chairs the geometry can draw", () => {
    // The canvas clamps a round table at 12; capacity must clamp with it or the
    // map would show 12 chairs while the unit sells more accesses.
    const table = createVenueElement("round_table", 0, { x: 200, y: 150 })
    const patched = { ...table, ...elementCapacityPatch(table, 99) }
    patched.seats = rebuildElementSeats(patched)

    assert.equal(elementCapacityRange(table).max, 12)
    assert.equal(patched.capacity, 12)
    assert.equal(patched.seats.length, 12)

    const long = createVenueElement("long_table", 0, { x: 100, y: 100 })
    const wide = { ...long, ...elementCapacityPatch(long, 99) }
    wide.seats = rebuildElementSeats(wide)
    assert.equal(wide.seats.length, 24)
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

  it("serializes round tables as one closed block for B2C", () => {
    const table = createVenueElement("round_table", 0, { x: 200, y: 150 })
    const map = emptyVenueMap()
    map.stage = null
    map.elements = [table]
    const layout = venueMapToSeatingLayout(map)
    assert.equal(layout[0]?.layout_type, "table_combo")
    const items = layout[0]?.rows[0]?.items ?? []
    assert.equal(items.length, 1)
    assert.equal(items[0]?.capacity, table.capacity)
    // The chairs stay on the canvas as drawing, but the table is the only unit
    // anyone can buy.
    assert.equal(table.seats.length, 8)
    assert.equal(flattenVenueMapSeats(map).length, 1)
  })

  it("treats new tables as closed blocks and loose chairs as their own units", () => {
    for (const type of ["round_table", "long_table", "vip_box"] as const) {
      const table = createVenueElement(type, 0, { x: 10, y: 10 })
      assert.equal(table.sellMode, "group")
      assert.equal(table.priceMode, "closed_unit")
      assert.ok(table.capacity > 0, `${type} debe nacer con capacidad`)
      assert.equal(isClosedBlockElement(table), true)
    }
    assert.equal(
      isClosedBlockElement(createVenueElement("vip_chair", 0, { x: 0, y: 0 })),
      false,
    )
  })

  it("emits accesses from capacity even when the chairs were never drawn", () => {
    const table = createVenueElement("round_table", 0, { x: 200, y: 150 })
    table.capacity = 10
    table.chairCount = 10
    table.seats = []
    const map = emptyVenueMap()
    map.stage = null
    map.elements = [table]
    const items = venueMapToSeatingLayout(map)[0]?.rows[0]?.items ?? []
    assert.equal(items.length, 1)
    assert.equal(items[0]?.capacity, 10)
  })

  it("backfills capacity on legacy tables saved without it", () => {
    const map = parseVenueMap({
      elements: [
        { id: "m1", type: "round_table", chairCount: 6 },
        { id: "m2", type: "long_table", sideA: 5, sideB: 3 },
      ],
    })
    assert.equal(map.elements[0]?.capacity, 6)
    assert.equal(map.elements[1]?.capacity, 8)
    assert.equal(elementCapacity(map.elements[1]!), 8)
  })

  it("draws one decorative chair per declared place, ignoring stale seats", () => {
    const table = createVenueElement("round_table", 0, { x: 200, y: 150 })
    table.capacity = 10
    table.seats = []
    const ring = aestheticChairGeometry(table)
    assert.equal(ring.seats.length, 10)

    const plank = createVenueElement("long_table", 0, { x: 200, y: 150 })
    plank.capacity = 7
    const sides = aestheticChairGeometry(plank)
    assert.equal(sides.sideA + sides.sideB, 7)
    assert.equal(sides.seats.length, 7)
  })

  it("exports whether the buyer map should draw chairs or plain blocks", () => {
    const map = emptyVenueMap()
    map.stage = null
    map.elements = [createVenueElement("round_table", 0, { x: 100, y: 100 })]
    assert.equal(map.showAestheticChairs, true)
    assert.equal(venueMapToSeatingLayout(map)[0]?.render_chairs, true)

    map.showAestheticChairs = false
    assert.equal(venueMapToSeatingLayout(map)[0]?.render_chairs, false)
  })

  it("round-trips the chair toggle and defaults legacy maps to showing them", () => {
    assert.equal(parseVenueMap({ elements: [] }).showAestheticChairs, true)
    assert.equal(
      parseVenueMap({ elements: [], showAestheticChairs: false })
        .showAestheticChairs,
      false,
    )
    assert.equal(
      parseVenueMap({ elements: [], show_aesthetic_chairs: false })
        .showAestheticChairs,
      false,
    )
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

  it("does not rewrite inventory occupancy onto map geometry", () => {
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
            { id: "s-occupied", number: 2, status: "occupied" },
            { id: "s-locked", number: 3, status: "locked" },
            { id: "s-reserved", number: 4, status: "reserved" },
          ],
        },
      ],
    })
    assert.equal(map.elements[0]?.seats[0]?.status, "available")
    assert.equal(map.elements[0]?.seats[1]?.status, "available")
    assert.equal(map.elements[0]?.seats[2]?.status, "blocked")
    assert.equal(map.elements[0]?.seats[3]?.status, "reserved")
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
