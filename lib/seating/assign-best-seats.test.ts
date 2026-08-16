import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"
import type { FlattenedVenueSeat } from "@/lib/seating/venue-map-geometry"

import {
  assignBestSeats,
  assignBestTableElements,
  previewFastAssign,
  resolveSectorAssignMeta,
  shouldSuggestFullTables,
  suggestAssignmentForPeople,
} from "./assign-best-seats"

function seat(
  patch: Partial<FlattenedVenueSeat> & Pick<FlattenedVenueSeat, "id" | "number" | "row">,
): FlattenedVenueSeat {
  return {
    x: 0,
    y: 0,
    sectorId: "mesas",
    sectorName: "Mesas",
    color: "#a855f7",
    price: 10000,
    mapStatus: "available",
    source: "element",
    ...patch,
  }
}

function table(row: string, ids: string[]): FlattenedVenueSeat[] {
  return ids.map((id, index) => seat({ id, row, number: index + 1 }))
}

describe("assignBestSeats", () => {
  const seats = [
    ...table("Mesa 1", ["m1a", "m1b", "m1c", "m1d"]),
    ...table("Mesa 2", ["m2a", "m2b", "m2c", "m2d"]),
  ]

  it("SEATS picks contiguous chairs on the best table", () => {
    const found = assignBestSeats({
      seats,
      sectorId: "mesas",
      count: 2,
      mode: "SEATS",
      isTableSector: true,
      occupancyBySeatId: { m1a: "occupied" },
    })
    assert.deepEqual(
      found.map((item) => item.id),
      ["m1b", "m1c"],
    )
  })

  it("FULL_TABLES picks completely free tables", () => {
    const found = assignBestSeats({
      seats,
      sectorId: "mesas",
      count: 2,
      mode: "FULL_TABLES",
      isTableSector: true,
    })
    assert.equal(found.length, 8)
    assert.deepEqual(
      found.map((item) => item.row),
      ["Mesa 1", "Mesa 1", "Mesa 1", "Mesa 1", "Mesa 2", "Mesa 2", "Mesa 2", "Mesa 2"],
    )
  })

  it("FULL_TABLES skips a partially occupied table", () => {
    const found = assignBestSeats({
      seats,
      sectorId: "mesas",
      count: 1,
      mode: "FULL_TABLES",
      isTableSector: true,
      occupancyBySeatId: { m1b: "occupied" },
    })
    assert.deepEqual(
      found.map((item) => item.row),
      ["Mesa 2", "Mesa 2", "Mesa 2", "Mesa 2"],
    )
  })
})

describe("previewFastAssign", () => {
  it("describes people on a shared table", () => {
    const preview = previewFastAssign({
      isTableSector: true,
      mode: "SEATS",
      quantity: 2,
      capacityPerUnit: 4,
      unitPrice: 15000,
    })
    assert.equal(preview.legend, "Se reservará 1 mesa con 2 lugares asignados.")
    assert.match(preview.buttonLabel, /Reservar 2 lugares por/)
    assert.equal(preview.totalPrice, 30000)
  })

  it("describes full tables and total capacity", () => {
    const preview = previewFastAssign({
      isTableSector: true,
      mode: "FULL_TABLES",
      quantity: 2,
      capacityPerUnit: 4,
      unitPrice: 15000,
    })
    assert.equal(
      preview.legend,
      "Se reservarán 2 mesas completas (Capacidad total: 8 personas).",
    )
    assert.match(preview.buttonLabel, /Reservar 2 mesas por/)
    assert.equal(preview.totalPrice, 120000)
  })

  it("suggests full tables when people exceed one table", () => {
    assert.equal(
      shouldSuggestFullTables({
        isTableSector: true,
        mode: "SEATS",
        count: 5,
        capacityPerUnit: 4,
      }),
      true,
    )
  })
})

describe("resolveSectorAssignMeta", () => {
  it("marks table_combo zones as table sectors", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "vip",
        name: "Palcos",
        color: "#a855f7",
        price: 80000,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        layoutType: "table_combo",
        sellMode: "group",
        rows: 2,
        itemsPerRow: 2,
        capacityPerUnit: 4,
        capacity: 16,
        labelPrefix: "Palco ",
      },
    ]
    const meta = resolveSectorAssignMeta(map, "vip", [], "Palcos")
    assert.equal(meta.isTableSector, true)
    assert.equal(meta.capacityPerUnit, 4)
    assert.equal(meta.unitNoun, "palco")
    assert.equal(meta.sellMode, "group")
  })
})

describe("assignBestTableElements", () => {
  it("elige mesas libres del sector en orden", () => {
    const map = emptyVenueMap()
    map.elements = [
      {
        id: "t-17",
        type: "long_table",
        label: "Tablón 17",
        category: "commercial",
        sectorName: "Mesas",
        groupName: "Mesas",
        groupId: "mesas",
        x: 10,
        y: 10,
        width: 40,
        height: 16,
        rotation: 0,
        price: 58824,
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
        id: "t-18",
        type: "long_table",
        label: "Tablón 18",
        category: "commercial",
        sectorName: "Mesas",
        groupName: "Mesas",
        groupId: "mesas",
        x: 60,
        y: 10,
        width: 40,
        height: 16,
        rotation: 0,
        price: 58824,
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
    const found = assignBestTableElements({
      map,
      sectorId: "mesas",
      sectorName: "Mesas",
      count: 1,
    })
    assert.equal(found[0]?.id, "t-17")
  })
})

describe("suggestAssignmentForPeople", () => {
  it("suggests contiguous seats for a party of two", () => {
    const map = emptyVenueMap()
    const seats = [
      ...table("Mesa 1", ["m1a", "m1b", "m1c", "m1d"]),
      ...table("Mesa 2", ["m2a", "m2b", "m2c", "m2d"]),
    ]
    const suggestion = suggestAssignmentForPeople({
      map,
      seats,
      sectorId: "mesas",
      people: 2,
      isTableSector: true,
      capacityPerUnit: 4,
      occupancyBySeatId: { m1a: "occupied" },
    })
    assert.equal(suggestion.kind, "seats")
    if (suggestion.kind === "seats") {
      assert.equal(suggestion.seats.length, 2)
    }
  })
})
