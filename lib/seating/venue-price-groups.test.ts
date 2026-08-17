import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { listVenuePriceGroups } from "./venue-price-groups"
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
})
