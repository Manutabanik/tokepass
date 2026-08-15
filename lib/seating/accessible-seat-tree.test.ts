import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"

import {
  assignContiguousSeats,
  buildAccessibleSeatTree,
} from "./accessible-seat-tree"
import type { FlattenedVenueSeat } from "./venue-map-geometry"

function seat(
  patch: Partial<FlattenedVenueSeat> & Pick<FlattenedVenueSeat, "id" | "number">,
): FlattenedVenueSeat {
  return {
    row: "1",
    x: 0,
    y: 0,
    sectorId: "platea",
    sectorName: "Platea",
    color: "#22c55e",
    price: 10000,
    mapStatus: "available",
    source: "sector",
    ...patch,
  }
}

describe("buildAccessibleSeatTree", () => {
  it("arma zonas GA cuando no hay butacas", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "campo",
        name: "Campo",
        color: "#22c55e",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "general",
        sellMode: "per_seat",
        rows: 0,
        itemsPerRow: 0,
        capacityPerUnit: 1,
        capacity: 200,
        labelPrefix: "",
      },
    ]
    const tree = buildAccessibleSeatTree({ map })
    assert.equal(tree.length, 1)
    assert.equal(tree[0]?.kind, "ga")
    assert.equal(tree[0]?.name, "Campo")
  })
})

describe("assignContiguousSeats", () => {
  it("elige el primer bloque contiguo libre de la fila", () => {
    const seats = [
      seat({ id: "a1", number: 1 }),
      seat({ id: "a2", number: 2 }),
      seat({ id: "a3", number: 3 }),
      seat({ id: "a4", number: 4 }),
    ]
    const found = assignContiguousSeats({
      seats,
      sectorId: "platea",
      quantity: 2,
      occupancyBySeatId: { a1: "occupied" },
    })
    assert.deepEqual(
      found.map((item) => item.id),
      ["a2", "a3"],
    )
  })

  it("no parte un bloque si hay un hueco", () => {
    const seats = [
      seat({ id: "a1", number: 1 }),
      seat({ id: "a2", number: 2 }),
      seat({ id: "a3", number: 3 }),
    ]
    const found = assignContiguousSeats({
      seats,
      sectorId: "platea",
      quantity: 2,
      occupancyBySeatId: { a2: "occupied" },
    })
    assert.equal(found.length, 0)
  })
})
