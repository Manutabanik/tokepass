import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueElement } from "./venue-element-geometry"
import { emptyVenueMap, parseVenueMap, serializeVenueMap } from "@/types/venue-map"

describe("venue-map persist", () => {
  it("roundtrip de butacas individuales con estado, precio y coordenadas", () => {
    const map = emptyVenueMap()
    map.sectors = [
      {
        id: "platea",
        name: "PLATEA",
        color: "#f97316",
        price: 8000,
        x: 20,
        y: 40,
        rows: 1,
        seatsPerRow: 1,
        curvature: 0,
        aisle: false,
        seats: [
          {
            id: "p-1",
            row: "A",
            number: 7,
            x: 88.5,
            y: 112.25,
            status: "reserved",
            price: 9500,
            rotation: 15,
            label: "Fila A - Asiento 7",
          },
        ],
      },
    ]
    map.elements = [
      {
        id: "chair-1",
        type: "vip_chair",
        label: "Fila 2 - Asiento 4",
        category: "commercial",
        sectorName: "VIP",
        x: 200,
        y: 180,
        width: 12,
        height: 12,
        rotation: 10,
        price: 18000,
        color: "#f97316",
        opacity: 1,
        chairCount: 1,
        sideA: 1,
        sideB: 1,
        sellMode: "per_seat",
        priceMode: "per_person",
        capacity: 1,
        seats: [
          {
            id: "chair-1-S1",
            number: 4,
            x: 200,
            y: 180,
            status: "blocked",
            price: 18000,
            rotation: 10,
          },
        ],
      },
    ]

    const persisted = parseVenueMap(serializeVenueMap(map))
    const sectorSeat = persisted.sectors[0]?.seats[0]
    const elementSeat = persisted.elements[0]?.seats[0]
    assert.equal(sectorSeat?.status, "reserved")
    assert.equal(sectorSeat?.price, 9500)
    assert.equal(sectorSeat?.x, 88.5)
    assert.equal(sectorSeat?.y, 112.25)
    assert.equal(sectorSeat?.rotation, 15)
    assert.equal(sectorSeat?.label, "Fila A - Asiento 7")
    assert.equal(elementSeat?.status, "blocked")
    assert.equal(elementSeat?.price, 18000)
    assert.equal(persisted.elements[0]?.x, 200)
    assert.equal(persisted.elements[0]?.label, "Fila 2 - Asiento 4")
  })

  it("acepta aliases de estado y precios en string sin perder la grada", () => {
    const persisted = parseVenueMap({
      version: 1,
      sectors: [
        {
          seats: [
            {
              id: "a-1",
              row: "B",
              number: 2,
              x: "40.5",
              y: "80",
              status: "disabled",
              price: "12000",
              rotation: "8",
            },
            {
              id: "a-2",
              row: "B",
              number: 3,
              x: 52,
              y: 80,
              status: "active",
            },
          ],
        },
      ],
      elements: [
        {
          id: "chair-legacy",
          type: "vip_chair",
          label: "Butaca suelta",
          x: 10,
          y: 20,
          seats: [{ id: "s1", number: 1, x: 10, y: 20, status: "inactive", price: "5000" }],
        },
      ],
    })
    const first = persisted.sectors[0]?.seats[0]
    const second = persisted.sectors[0]?.seats[1]
    assert.ok(persisted.sectors[0]?.id)
    assert.equal(persisted.sectors[0]?.name, "Sector")
    assert.equal(first?.status, "blocked")
    assert.equal(first?.price, 12000)
    assert.equal(first?.x, 40.5)
    assert.equal(first?.rotation, 8)
    assert.equal(second?.status, "available")
    assert.equal(persisted.elements[0]?.seats[0]?.status, "blocked")
    assert.equal(persisted.elements[0]?.seats[0]?.price, 5000)
  })

  it("does not persist sold or occupied as blocked map geometry", () => {
    const persisted = parseVenueMap({
      version: 1,
      sectors: [
        {
          seats: [
            { id: "sold-1", row: "A", number: 1, x: 10, y: 10, status: "sold" },
            {
              id: "occ-1",
              row: "A",
              number: 2,
              x: 20,
              y: 10,
              status: "occupied",
            },
          ],
        },
      ],
    })
    const roundtrip = parseVenueMap(serializeVenueMap(persisted))
    assert.equal(persisted.sectors[0]?.seats[0]?.status, "available")
    assert.equal(persisted.sectors[0]?.seats[1]?.status, "available")
    assert.equal(roundtrip.sectors[0]?.seats[0]?.status, "available")
    assert.equal(roundtrip.sectors[0]?.seats[1]?.status, "available")
  })

  it("persiste zoneId de asientos y mesas y acepta aliases", () => {
    const map = emptyVenueMap()
    map.elements = [
      createVenueElement("vip_chair", 0, { x: 120, y: 80 }, undefined, {
        zoneId: "zona-vip",
      }),
    ]
    const persisted = parseVenueMap(serializeVenueMap(map))
    assert.equal(persisted.elements[0]?.zoneId, "zona-vip")

    const fromSnake = parseVenueMap({
      elements: [
        { id: "m1", type: "round_table", x: 10, y: 20, zone_id: "zona-a" },
      ],
    })
    assert.equal(fromSnake.elements[0]?.zoneId, "zona-a")

    const fromParent = parseVenueMap({
      elements: [
        { id: "m2", type: "round_table", x: 10, y: 20, parentId: "zona-b" },
      ],
    })
    assert.equal(fromParent.elements[0]?.zoneId, "zona-b")
  })

  it("persiste la pieza sin etiqueta a la vista", () => {
    const map = emptyVenueMap()
    map.elements = [
      { ...createVenueElement("round_table", 4, { x: 60, y: 40 }), hideLabel: true },
      createVenueElement("round_table", 5, { x: 120, y: 40 }),
    ]
    const persisted = parseVenueMap(serializeVenueMap(map))
    assert.equal(persisted.elements[0]?.hideLabel, true)
    // El nombre viaja igual: el boleto y la puerta lo necesitan.
    assert.equal(persisted.elements[0]?.label, "Mesa 5")
    assert.equal(persisted.elements[1]?.hideLabel, undefined)

    const fromSnake = parseVenueMap({
      elements: [
        { id: "m3", type: "round_table", x: 10, y: 20, hide_label: true },
      ],
    })
    assert.equal(fromSnake.elements[0]?.hideLabel, true)
  })
})
