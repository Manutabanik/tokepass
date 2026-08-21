import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  hasInteractiveVenueMap,
  rebuildSectorSeats,
  venueMapToSeatingLayout,
} from "./venue-map-geometry"
import { parseVenueMap } from "@/types/venue-map"
import type { VenueMapSector } from "@/types/venue-map"

function sector(patch: Partial<VenueMapSector> = {}): VenueMapSector {
  return {
    id: "sec-platea",
    name: "Platea Baja",
    color: "#f97316",
    price: 125000,
    x: 200,
    y: 120,
    rows: 2,
    seatsPerRow: 4,
    curvature: 0,
    aisle: false,
    seats: [],
    ...patch,
  }
}

describe("venue-map-geometry", () => {
  it("places a different seat count on each row", () => {
    const seats = rebuildSectorSeats(
      sector({
        rows: 2,
        seatsPerRow: 4,
        rowsConfig: [
          { label: "1", seatCount: 2 },
          { label: "2", seatCount: 4 },
        ],
      }),
    )
    assert.equal(seats.length, 6)
    assert.equal(seats.filter((seat) => seat.row === "1").length, 2)
    assert.equal(seats.filter((seat) => seat.row === "2").length, 4)
    const front = seats.filter((seat) => seat.row === "1")
    const back = seats.filter((seat) => seat.row === "2")
    const frontMid = (front[0]!.x + front[1]!.x) / 2
    const backMid = (back[0]!.x + back[3]!.x) / 2
    assert.equal(Math.abs(frontMid - backMid) < 0.2, true)
  })

  it("builds a grid of seats with stable ids", () => {
    const seats = rebuildSectorSeats(sector())
    assert.equal(seats.length, 8)
    assert.equal(seats[0]?.id, "sec-platea-F1-A1")
    assert.equal(seats[0]?.row, "1")
    assert.equal(seats[0]?.status, "available")
  })

  it("inserts a central aisle gap without dropping seats", () => {
    const grid = rebuildSectorSeats(sector({ aisle: false, curvature: 0 }))
    const withAisle = rebuildSectorSeats(sector({ aisle: true, curvature: 0 }))
    assert.equal(withAisle.length, grid.length)
    const firstRow = withAisle.filter((seat) => seat.row === "1")
    const gap = firstRow[2]!.x - firstRow[1]!.x
    const baseGap = grid.filter((seat) => seat.row === "1")
    assert.equal(gap > baseGap[2]!.x - baseGap[1]!.x, true)
  })

  it("fans seats when curvature is applied", () => {
    const flat = rebuildSectorSeats(sector({ curvature: 0, rows: 1, seatsPerRow: 6 }))
    const curved = rebuildSectorSeats(sector({ curvature: 0.8, rows: 1, seatsPerRow: 6 }))
    const flatSpan = Math.max(...flat.map((s) => s.x)) - Math.min(...flat.map((s) => s.x))
    const curveSpan = Math.max(...curved.map((s) => s.x)) - Math.min(...curved.map((s) => s.x))
    assert.equal(curveSpan !== flatSpan, true)
  })

  it("serializes sectors into seating_layout rows", () => {
    const built = sector({ seats: rebuildSectorSeats(sector()) })
    const layout = venueMapToSeatingLayout({
      version: 1,
      stage: null,
      labels: [],
      aisles: [],
      sectors: [built],
      elements: [],
      zones: [],
      backgroundImage: null,
      backgroundOpacity: 0.4,
      backgroundScale: 1,
      backgroundX: 0,
      backgroundY: 0,
    })
    assert.equal(layout[0]?.layout_type, "numbered_seat")
    assert.equal(layout[0]?.rows.length, 2)
  })

  it("groups ring tables into a single seating sector", () => {
    const layout = venueMapToSeatingLayout({
      version: 1,
      stage: null,
      labels: [],
      aisles: [],
      sectors: [],
      zones: [],
      backgroundImage: null,
      backgroundOpacity: 0.4,
      backgroundScale: 1,
      backgroundX: 0,
      backgroundY: 0,
      elements: [
        {
          id: "M-01",
          type: "round_table",
          label: "Mesa 01",
          category: "commercial",
          sectorName: "Mesa Premium",
          x: 140,
          y: 210,
          width: 36,
          height: 36,
          rotation: 15,
          price: 45000,
          color: "#ea580c",
          opacity: 1,
          chairCount: 8,
          sideA: 4,
          sideB: 4,
          sellMode: "group",
          capacity: 8,
          seats: [
            { id: "M-01-S1", number: 1, x: 140, y: 210, status: "available" },
          ],
          groupId: "grada-naranja",
          groupName: "Grada Naranja - Mesas y Tablones",
          ringIndex: 0,
        },
        {
          id: "TAB-01",
          type: "long_table",
          label: "Tablon 01",
          category: "commercial",
          sectorName: "Mesa Premium",
          x: 180,
          y: 240,
          width: 96,
          height: 28,
          rotation: 22,
          price: 60000,
          color: "#ea580c",
          opacity: 1,
          chairCount: 8,
          sideA: 4,
          sideB: 4,
          sellMode: "group",
          capacity: 8,
          seats: [
            { id: "TAB-01-S1", number: 1, x: 180, y: 240, status: "available" },
          ],
          groupId: "grada-naranja",
          groupName: "Grada Naranja - Mesas y Tablones",
          ringIndex: 1,
        },
      ],
    })
    assert.equal(layout.length, 1)
    assert.equal(layout[0]?.id, "grada-naranja")
    assert.equal(layout[0]?.layout_type, "table_combo")
    assert.equal(layout[0]?.rows.length, 2)
    assert.equal(layout[0]?.rows[0]?.items[0]?.id, "M-01")
  })

  it("flattens nested sector elements and snake_case background", () => {
    const map = parseVenueMap({
      background_image: "https://cdn.example.com/anfiteatro.jpg",
      background_opacity: 0.4,
      sectors: [
        {
          id: "grada-naranja",
          name: "Grada Naranja - Mesas y Tablones",
          color: "#ea580c",
          elements: [
            {
              id: "M-01",
              type: "round_table",
              label: "Mesa 01",
              x: 140.5,
              y: 210.2,
              rotation: 15,
              price: 45000,
              sellMode: "group",
              seats: [],
            },
          ],
        },
      ],
    })
    assert.equal(map.backgroundImage, "https://cdn.example.com/anfiteatro.jpg")
    assert.equal(map.backgroundOpacity, 0.4)
    assert.equal(map.sectors.length, 0)
    assert.equal(map.elements[0]?.id, "M-01")
    assert.equal(map.elements[0]?.groupId, "grada-naranja")
  })

  it("parses studio maps from JSON strings and nested layout.elements", () => {
    const nested = parseVenueMap({
      layout: {
        elements: [
          {
            id: "mesa-12",
            type: "round_table",
            label: "Mesa 12",
            x: 40,
            y: 40,
            width: 28,
            height: 28,
            price: 15000,
          },
        ],
      },
    })
    assert.equal(nested.elements[0]?.id, "mesa-12")
    assert.equal(hasInteractiveVenueMap(nested), true)

    const encoded = parseVenueMap(
      JSON.stringify({
        elements: [
          {
            id: "box-1",
            type: "vip_box",
            label: "Box 1",
            x: 10,
            y: 10,
            width: 40,
            height: 24,
          },
        ],
      }),
    )
    assert.equal(encoded.elements[0]?.id, "box-1")
    assert.equal(hasInteractiveVenueMap(encoded), true)
  })

  it("detects an interactive public map from zones or background", () => {
    assert.equal(hasInteractiveVenueMap(parseVenueMap({})), false)
    assert.equal(
      hasInteractiveVenueMap(
        parseVenueMap({
          zones: [
            {
              id: "campo",
              name: "Campo",
              color: "#22d3ee",
              price: 10000,
              polygon: [
                { x: 10, y: 10 },
                { x: 40, y: 10 },
                { x: 40, y: 40 },
              ],
            },
          ],
        }),
      ),
      true,
    )
    assert.equal(
      hasInteractiveVenueMap(
        parseVenueMap({ backgroundImage: "https://cdn.example.com/mapa.jpg" }),
      ),
      true,
    )
  })
})
