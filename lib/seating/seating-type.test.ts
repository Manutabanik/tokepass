import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap, parseVenueMap } from "@/types/venue-map"

import {
  generalAdmissionLabel,
  hasAssignedReservedPlaces,
  reservedPlaceLabel,
  resolveEffectiveSeatingType,
  resolveSeatingType,
  validateSectorModalities,
} from "./seating-type"

describe("seating-type", () => {
  it("prioriza seatingType explícito sobre el layout", () => {
    assert.equal(
      resolveSeatingType({ seatingType: "GENERAL", layoutType: "table_combo" }),
      "GENERAL",
    )
    assert.equal(
      resolveSeatingType({ seating_type: "RESERVED", layoutType: "general" }),
      "RESERVED",
    )
  })

  it("infiere GENERAL si no hay sillas ni mesas", () => {
    assert.equal(resolveSeatingType({}), "GENERAL")
    assert.equal(
      resolveSeatingType({ type: "standing_zone", seats: [], tables: [] }),
      "GENERAL",
    )
  })

  it("infiere RESERVED por layout o mobiliario", () => {
    assert.equal(resolveSeatingType({ layoutType: "table_combo" }), "RESERVED")
    assert.equal(
      resolveSeatingType({ seats: [{ id: "s1" }] }),
      "RESERVED",
    )
  })

  it("trata un reservado vacío como GENERAL en checkout", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "table_combo",
        seatingType: "RESERVED",
        sellMode: "group",
        rows: 4,
        itemsPerRow: 10,
        capacityPerUnit: 8,
        capacity: 40,
        labelPrefix: "Mesa ",
      },
    ]
    assert.equal(hasAssignedReservedPlaces(map, "campo"), false)
    assert.equal(
      resolveEffectiveSeatingType({ ...map.zones[0]!, id: "campo" }, map),
      "GENERAL",
    )
  })

  it("mantiene RESERVED cuando hay una mesa asignada", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "vip",
        name: "VIP",
        color: "#f97316",
        price: 20000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "table_combo",
        seatingType: "RESERVED",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 4,
        capacity: 4,
        labelPrefix: "Mesa ",
      },
    ]
    map.elements = [
      {
        id: "mesa-1",
        type: "round_table",
        label: "Mesa 1",
        category: "commercial",
        sectorName: "VIP",
        groupId: "vip",
        x: 10,
        y: 10,
        width: 28,
        height: 28,
        rotation: 0,
        price: 20000,
        color: "#f97316",
        opacity: 1,
        chairCount: 4,
        sideA: 2,
        sideB: 2,
        sellMode: "group",
        capacity: 4,
        seats: [],
      },
    ]
    assert.equal(hasAssignedReservedPlaces(map, "vip"), true)
    assert.equal(
      resolveEffectiveSeatingType({ ...map.zones[0]!, id: "vip" }, map),
      "RESERVED",
    )
  })

  it("arma etiquetas de carrito", () => {
    assert.equal(generalAdmissionLabel("Campo"), "Sector Campo - Entrada General")
    assert.equal(
      reservedPlaceLabel({
        sectorName: "VIP",
        tableName: "Mesa 3",
        seatLabel: "Silla 2",
      }),
      "Sector VIP - Mesa 3, Silla 2",
    )
  })

  it("valida precio/capacidad en general y mobiliario en reservado", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "ga",
        name: "Pista",
        color: "#22d3ee",
        price: 0,
        polygon: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
        ],
        layoutType: "general",
        seatingType: "GENERAL",
        sellMode: "per_seat",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 0,
        labelPrefix: "Campo ",
      },
      {
        id: "num",
        name: "Platea",
        color: "#f97316",
        price: 12000,
        polygon: [
          { x: 5, y: 0 },
          { x: 9, y: 0 },
          { x: 9, y: 4 },
        ],
        layoutType: "table_combo",
        seatingType: "RESERVED",
        sellMode: "group",
        rows: 2,
        itemsPerRow: 2,
        capacityPerUnit: 4,
        capacity: 16,
        labelPrefix: "Mesa ",
      },
    ]
    const issues = validateSectorModalities(map)
    assert.equal(issues.length, 2)
    assert.match(issues[0]!.message, /Pista necesita precio y capacidad/)
    assert.match(issues[1]!.message, /Platea necesita al menos una mesa/)
  })

  it("parsea un polígono sin layout como GENERAL", () => {
    const map = parseVenueMap({
      zones: [
        {
          id: "libre",
          name: "Libre",
          polygon: [
            { x: 0, y: 0 },
            { x: 8, y: 0 },
            { x: 8, y: 8 },
          ],
          price: 5000,
          capacity: 80,
        },
      ],
    })
    assert.equal(map.zones[0]?.layoutType, "general")
    assert.equal(map.zones[0]?.seatingType, "GENERAL")
  })
})
