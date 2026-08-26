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

  it("incluye mesas agrupadas en una zona", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "mesas",
        name: "Mesas",
        color: "#22c55e",
        price: 50000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "table_combo",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 2,
        capacityPerUnit: 4,
        capacity: 8,
        labelPrefix: "Mesa ",
      },
    ]
    map.elements = [
      {
        id: "t-1",
        type: "round_table",
        label: "Mesa 1",
        category: "commercial",
        sectorName: "Mesas",
        groupName: "Mesas",
        groupId: "mesas",
        x: 10,
        y: 10,
        width: 24,
        height: 24,
        rotation: 0,
        price: 50000,
        color: "#22c55e",
        opacity: 1,
        chairCount: 4,
        sideA: 2,
        sideB: 2,
        sellMode: "group",
        capacity: 4,
        seats: [],
      },
      {
        id: "t-2",
        type: "round_table",
        label: "Mesa 2",
        category: "commercial",
        sectorName: "Mesas",
        groupName: "Mesas",
        groupId: "mesas",
        x: 40,
        y: 10,
        width: 24,
        height: 24,
        rotation: 0,
        price: 50000,
        color: "#22c55e",
        opacity: 1,
        chairCount: 4,
        sideA: 2,
        sideB: 2,
        sellMode: "group",
        capacity: 4,
        seats: [],
      },
    ]
    const tree = buildAccessibleSeatTree({
      map,
      selectedSeatIds: ["t-2"],
    })
    const sector = tree.find((item) => item.id === "mesas")
    assert.equal(sector?.kind, "numbered")
    assert.equal(sector?.rows.flatMap((row) => row.seats).length, 2)
    assert.equal(
      sector?.rows.flatMap((row) => row.seats).find((seat) => seat.id === "t-2")
        ?.status,
      "selected",
    )
  })

  it("no marca un sector agotado si los asientos solo estan en hold", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "platea",
        name: "Platea",
        color: "#22c55e",
        price: 10000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "numbered_seat",
        sellMode: "per_seat",
        rows: 1,
        itemsPerRow: 2,
        capacityPerUnit: 1,
        capacity: 2,
        labelPrefix: "",
      },
    ]
    const open = buildAccessibleSeatTree({ map }).find((item) => item.id === "platea")
    const seatIds = open?.rows.flatMap((row) => row.seats).map((seat) => seat.id) ?? []
    assert.ok(seatIds.length > 0)
    const occupancyBySeatId = Object.fromEntries(
      seatIds.map((id) => [id, "held" as const]),
    )
    const held = buildAccessibleSeatTree({ map, occupancyBySeatId }).find(
      (item) => item.id === "platea",
    )
    assert.equal(held?.soldOut, false)
    assert.equal(held?.availableCount, 0)
    assert.ok(held?.rows.flatMap((row) => row.seats).every((seat) => seat.status === "held"))
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

  it("no asigna un asiento en hold de otro comprador", () => {
    const seats = [
      seat({ id: "a1", number: 1 }),
      seat({ id: "a2", number: 2 }),
    ]
    const found = assignContiguousSeats({
      seats,
      sectorId: "platea",
      quantity: 1,
      occupancyBySeatId: { a1: "held" },
    })
    assert.deepEqual(
      found.map((item) => item.id),
      ["a2"],
    )
  })
})
