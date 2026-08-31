import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"

import {
  collectVenueMapInventoryIds,
  hydrateVenueMap,
  isVenueMapElementSoldOut,
  occupancyFromSoldOutTicketTypes,
  occupancyFromSoldTicketRefs,
  rollupOccupancyToParents,
  shouldPaintBuyerMapInventory,
  soldOutTicketTypeIds,
  SOLD_MAP_FILL,
} from "./map-inventory-hydration"

function tableMap() {
  const map = emptyVenueMap()
  map.elements = [
    {
      id: "mesa-9",
      type: "round_table",
      label: "Mesa 9",
      category: "commercial",
      sectorName: "VIP",
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      rotation: 0,
      price: 10000,
      color: "#eab308",
      opacity: 1,
      chairCount: 2,
      sideA: 1,
      sideB: 1,
      sellMode: "group",
      capacity: 2,
      ticketTypeId: "tier-vip",
      seats: [
        {
          id: "mesa-9-S1",
          number: 1,
          x: 0,
          y: 0,
          status: "available",
        },
        {
          id: "mesa-9-S2",
          number: 2,
          x: 10,
          y: 0,
          status: "available",
        },
      ],
    },
  ]
  map.zones = [
    {
      id: "zone-vip",
      name: "VIP",
      color: "#eab308",
      price: 10000,
      polygon: [],
      layoutType: "table_combo",
      sellMode: "group",
      rows: 0,
      itemsPerRow: 0,
      capacityPerUnit: 2,
      capacity: 4,
      labelPrefix: "M",
    },
  ]
  map.elements[0]!.groupId = "zone-vip"
  return map
}

describe("map-inventory-hydration", () => {
  it("collects sellable element and chair ids", () => {
    const ids = collectVenueMapInventoryIds(tableMap())
    assert.deepEqual(ids.sort(), ["mesa-9", "mesa-9-S1", "mesa-9-S2"])
  })

  it("lists sold-out ticket and sector ids from live stock", () => {
    assert.deepEqual(
      soldOutTicketTypeIds([
        { id: "tier-vip", available: 0, seatingSectorId: "zone-vip" },
        { id: "tier-ga", available: 4 },
      ]).sort(),
      ["tier-vip", "zone-vip"],
    )
  })

  it("does not treat missing stock fields as sold out", () => {
    assert.deepEqual(soldOutTicketTypeIds([{ id: "tier-vip" }]), [])
  })

  it("locks every place of a sold-out ticket type", () => {
    const occupancy = occupancyFromSoldOutTicketTypes(tableMap(), ["tier-vip"])
    assert.equal(occupancy["mesa-9"], "occupied")
    assert.equal(occupancy["mesa-9-S1"], "occupied")
    assert.equal(occupancy["mesa-9-S2"], "occupied")
  })

  it("locks places inside a sold-out sector", () => {
    const occupancy = occupancyFromSoldOutTicketTypes(tableMap(), ["zone-vip"])
    assert.equal(occupancy["zone-vip"], "occupied")
    assert.equal(occupancy["mesa-9"], "occupied")
  })

  it("rolls chair occupancy up to the parent table", () => {
    const rolled = rollupOccupancyToParents(
      { "mesa-9-S1": "occupied", "mesa-9-S2": "occupied" },
      tableMap(),
    )
    assert.equal(rolled["mesa-9"], "occupied")
  })

  it("treats a fully occupied table as sold out", () => {
    const map = tableMap()
    const element = map.elements[0]!
    assert.equal(
      isVenueMapElementSoldOut(element, {
        "mesa-9": "occupied",
      }),
      true,
    )
  })

  it("locks a group table when any chair is occupied", () => {
    const map = tableMap()
    const element = map.elements[0]!
    assert.equal(
      isVenueMapElementSoldOut(element, {
        "mesa-9-S1": "occupied",
      }),
      true,
    )
    assert.equal(isVenueMapElementSoldOut(element, {}), false)
  })

  it("maps issued tickets to occupied layout ids", () => {
    const occupancy = occupancyFromSoldTicketRefs([
      { seat_id: "mesa-9", seating_unit_id: "unit-9", status: "valid" },
      { seat_id: "mesa-10", status: "cancelled" },
    ])
    assert.equal(occupancy["mesa-9"], "occupied")
    assert.equal(occupancy["unit-9"], "occupied")
    assert.equal(occupancy["mesa-10"], undefined)
  })

  it("hydrates the static map from units, tickets and sold-out SKUs without mutating input", () => {
    const map = tableMap()
    const originalColor = map.elements[0]!.color
    const originalStatus = map.elements[0]!.seats[0]!.status
    const hydrated = hydrateVenueMap(map, {
      seatingUnits: [
        {
          id: "unit-s1",
          layoutItemId: "mesa-9-S1",
          status: "sold",
        },
      ],
      soldTickets: [
        { seating_unit_id: "unit-s2", layout_item_id: "mesa-9-S2", status: "valid" },
      ],
      lockUnknownLayoutIds: false,
    })
    assert.equal(map.elements[0]!.color, originalColor)
    assert.equal(map.elements[0]!.seats[0]!.status, originalStatus)
    assert.equal(hydrated.occupancy["mesa-9-S1"], "occupied")
    assert.equal(hydrated.occupancy["mesa-9-S2"], "occupied")
    assert.equal(hydrated.occupancy["unit-s2"], "occupied")
    assert.equal(hydrated.occupancy["mesa-9"], "occupied")
    assert.equal(hydrated.map.elements[0]!.color, SOLD_MAP_FILL)
    assert.equal(hydrated.map.elements[0]!.seats[0]!.status, "blocked")
  })

  it("maps a ticket seating_unit_id onto the layout id via the unit roster", () => {
    const map = tableMap()
    const hydrated = hydrateVenueMap(map, {
      seatingUnits: [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", layoutItemId: "mesa-9", status: "available" },
      ],
      soldTickets: [
        { seating_unit_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "valid" },
      ],
      lockUnknownLayoutIds: false,
    })
    assert.equal(hydrated.occupancy["mesa-9"], "occupied")
    assert.equal(hydrated.occupancy["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], "occupied")
  })

  it("does not paint the buyer map until inventory is ready", () => {
    assert.equal(
      shouldPaintBuyerMapInventory({
        inventoryPending: true,
        snapshotReady: true,
        hasEventId: true,
      }),
      false,
    )
    assert.equal(
      shouldPaintBuyerMapInventory({
        inventoryPending: false,
        snapshotReady: false,
        hasEventId: true,
      }),
      false,
    )
    assert.equal(
      shouldPaintBuyerMapInventory({
        inventoryPending: false,
        snapshotReady: true,
        hasEventId: true,
      }),
      true,
    )
    assert.equal(
      shouldPaintBuyerMapInventory({
        inventoryPending: false,
        snapshotReady: false,
        hasEventId: false,
      }),
      true,
    )
  })
})
