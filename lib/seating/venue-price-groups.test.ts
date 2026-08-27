import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyVenuePriceGroupPatch, listVenuePriceGroups } from "./venue-price-groups"
import { emptyVenueMap } from "@/types/venue-map"

describe("venue-price-groups", () => {
  it("expone table_combo como unidades fisicas, no sillas", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zona-vip",
        name: "VIP Festival",
        color: "#22d3ee",
        price: 80000,
        polygon: [
          { x: 40, y: 40 },
          { x: 220, y: 40 },
          { x: 220, y: 180 },
          { x: 40, y: 180 },
        ],
        layoutType: "table_combo",
        sellMode: "group",
        rows: 2,
        itemsPerRow: 3,
        capacityPerUnit: 8,
        capacity: 48,
        labelPrefix: "Mesa ",
      },
    ]

    const groups = listVenuePriceGroups(map)
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.count, 6)
    assert.equal(groups[0]?.unit, "mesas")
    assert.equal(groups[0]?.price, 80000)
  })

  it("renombra un grupo de mesas en el paso de precios", () => {
    const map = emptyVenueMap()
    map.elements = [
      {
        id: "mesa-1",
        type: "round_table",
        x: 10,
        y: 10,
        rotation: 0,
        label: "Mesa 01",
        seats: [],
        capacity: 8,
        price: 70000,
        color: "#f97316",
        groupId: "grada-naranja",
        groupName: "Grada Naranja",
        sectorName: "Grada Naranja",
      },
    ]
    const group = listVenuePriceGroups(map)[0]
    assert.ok(group)
    const next = applyVenuePriceGroupPatch(map, group, { name: "Grada Coral" })
    assert.equal(next.elements[0]?.groupName, "Grada Coral")
    assert.equal(next.elements[0]?.sectorName, "Grada Coral")
    assert.equal(next.elements[0]?.price, 70000)
  })
})
