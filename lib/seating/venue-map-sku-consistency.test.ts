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
    assert.match(formatVenueMapSkuErrors(result.errors), /8 sillas|mesa o palco|por silla/)
    assert.doesNotMatch(formatVenueMapSkuErrors(result.errors), /table_combo|SKU|capacity_per_unit/)
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
    assert.match(formatVenueMapSkuErrors(result.errors), /8 sillas/)
    assert.doesNotMatch(formatVenueMapSkuErrors(result.errors), /capacity_per_unit|SKU/)
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
          capacityPerUnit: 1,
        },
      ],
    })
    assert.equal(result.ok, false)
    assert.match(formatVenueMapSkuErrors(result.errors), /por silla|mesa completa/)
    assert.doesNotMatch(formatVenueMapSkuErrors(result.errors), /numbered_seat|SKU/)
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

  it("no bloquea un mapa inconsistente si no hay entradas ligadas a sectores", () => {
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
    assert.equal(result.ok, true)
  })

  it("sigue validando una zona reservada cuando hay un ticket ligado", () => {
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
    const result = validateVenueMapSkuConsistency({
      map,
      tickets: [
        {
          name: "Salon",
          seatingSectorId: "zone-mesas",
          layoutType: "numbered_seat",
          capacityPerUnit: 1,
        },
      ],
    })
    assert.equal(result.ok, false)
    assert.match(
      formatVenueMapSkuErrors(result.errors),
      /mesa o palco|por silla|sillas del mapa/,
    )
  })

  it("resume varias gradas en un mensaje accionable", () => {
    const map = emptyVenueMap()
    map.elements = [
      table("naranja", { sectorName: "Grada Naranja", chairCount: 4, seats: [
        { id: "n-1", number: 1, x: 0, y: 0, status: "available" },
        { id: "n-2", number: 2, x: 1, y: 0, status: "available" },
        { id: "n-3", number: 3, x: 2, y: 0, status: "available" },
        { id: "n-4", number: 4, x: 3, y: 0, status: "available" },
      ] }),
      table("amarilla", { sectorName: "Grada Amarilla" }),
    ]
    const result = validateVenueMapSkuConsistency({
      map,
      tickets: [
        {
          name: "Grada Naranja",
          seatingSectorId: "naranja",
          layoutType: "table_combo",
          capacityPerUnit: 2,
        },
        {
          name: "Grada Amarilla",
          seatingSectorId: "amarilla",
          layoutType: "table_combo",
          capacityPerUnit: 3,
        },
      ],
    })
    assert.equal(result.ok, false)
    const formatted = formatVenueMapSkuErrors(result.errors)
    assert.match(formatted, /Grada Naranja: 4 sillas/)
    assert.match(formatted, /Grada Amarilla: 8 sillas/)
    assert.doesNotMatch(formatted, /capacity_per_unit|SKU/)
  })
})
