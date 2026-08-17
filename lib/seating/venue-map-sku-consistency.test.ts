import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatVenueMapSkuErrors,
  validateVenueMapSkuConsistency,
} from "@/lib/seating/venue-map-sku-consistency"
import { emptyVenueMap } from "@/types/venue-map"
import type { VenueMapElement } from "@/types/venue-map"

function table(
  id: string,
  extras: Partial<VenueMapElement> = {},
): VenueMapElement {
  return {
    id,
    type: "round_table",
    label: "Mesa 1",
    category: "commercial",
    sectorName: "Mesas",
    x: 10,
    y: 10,
    width: 28,
    height: 28,
    rotation: 0,
    price: 80000,
    color: "#f97316",
    opacity: 1,
    chairCount: 8,
    sideA: 0,
    sideB: 0,
    sellMode: "group",
    capacity: 8,
    seats: [
      { id: `${id}-s1`, number: 1, x: 0, y: 0, status: "available" },
      { id: `${id}-s2`, number: 2, x: 1, y: 0, status: "available" },
      { id: `${id}-s3`, number: 3, x: 2, y: 0, status: "available" },
      { id: `${id}-s4`, number: 4, x: 3, y: 0, status: "available" },
      { id: `${id}-s5`, number: 5, x: 4, y: 0, status: "available" },
      { id: `${id}-s6`, number: 6, x: 5, y: 0, status: "available" },
      { id: `${id}-s7`, number: 7, x: 6, y: 0, status: "available" },
      { id: `${id}-s8`, number: 8, x: 7, y: 0, status: "available" },
    ],
    ...extras,
  }
}

describe("validateVenueMapSkuConsistency", () => {
  it("bloquea mesa group vinculada a SKU numbered_seat", () => {
    const map = emptyVenueMap()
    map.elements = [table("mesa-1")]
    const result = validateVenueMapSkuConsistency({
      map,
      tickets: [
        {
          name: "Mesa VIP",
          seatingSectorId: "mesa-1",
          layoutType: "numbered_seat",
          capacityPerUnit: 1,
        },
      ],
    })
    assert.equal(result.ok, false)
    assert.match(formatVenueMapSkuErrors(result.errors), /table_combo/)
  })

  it("exige capacity_per_unit igual a las sillas cuando sellMode es group", () => {
    const map = emptyVenueMap()
    map.elements = [table("mesa-1")]
    const result = validateVenueMapSkuConsistency({
      map,
      tickets: [
        {
          name: "Mesa VIP",
          seatingSectorId: "mesa-1",
          layoutType: "table_combo",
          capacityPerUnit: 4,
        },
      ],
    })
    assert.equal(result.ok, false)
    assert.match(formatVenueMapSkuErrors(result.errors), /capacity_per_unit = 8/)
  })

  it("exige numbered_seat cuando el mapa vende por silla", () => {
    const map = emptyVenueMap()
    map.elements = [table("mesa-1", { sellMode: "per_seat" })]
    const result = validateVenueMapSkuConsistency({
      map,
      tickets: [
        {
          name: "Silla",
          seatingSectorId: "mesa-1",
          layoutType: "table_combo",
          capacityPerUnit: 8,
        },
      ],
    })
    assert.equal(result.ok, false)
    assert.match(formatVenueMapSkuErrors(result.errors), /numbered_seat/)
  })

  it("acepta mesa group + table_combo con la misma capacidad", () => {
    const map = emptyVenueMap()
    map.elements = [table("mesa-1")]
    const result = validateVenueMapSkuConsistency({
      map,
      tickets: [
        {
          name: "Mesa VIP",
          seatingSectorId: "mesa-1",
          layoutType: "table_combo",
          capacityPerUnit: 8,
        },
      ],
    })
    assert.equal(result.ok, true)
  })

  it("detecta zona group con layout numbered_seat aunque no haya tickets", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-mesas",
        name: "Salon",
        color: "#22d3ee",
        price: 10000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "numbered_seat",
        sellMode: "group",
        rows: 2,
        itemsPerRow: 3,
        capacityPerUnit: 8,
        capacity: 48,
        labelPrefix: "Mesa ",
      },
    ]
    const result = validateVenueMapSkuConsistency({ map, tickets: [] })
    assert.equal(result.ok, false)
    assert.match(formatVenueMapSkuErrors(result.errors), /table_combo/)
  })
})
