import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildVenueLayerTree } from "@/components/admin/venue-layer-tree"

import { createVenueElement } from "./venue-element-geometry"
import { emptyVenueMap } from "@/types/venue-map"

describe("venue-layer-tree", () => {
  it("indenta asientos y mesas debajo de su zona por zoneId", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zona-vip",
        name: "VIP",
        color: "#22d3ee",
        price: 0,
        polygon: [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
          { x: 40, y: 40 },
          { x: 10, y: 40 },
        ],
        layoutType: "table_combo",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 4,
        capacity: 4,
        labelPrefix: "Mesa ",
      },
    ]
    const inside = createVenueElement(
      "round_table",
      0,
      { x: 700, y: 500 },
      undefined,
      { zoneId: "zona-vip" },
    )
    const outside = createVenueElement("vip_chair", 1, { x: 20, y: 20 })
    outside.sectorName = "General"
    map.elements = [inside, outside]
    const tree = buildVenueLayerTree(map)
    const zoneNode = tree.find((node) => node.id === "zona-vip")
    assert.ok(zoneNode)
    assert.equal(
      zoneNode?.children?.some(
        (child) =>
          child.id === inside.id || child.id.startsWith(`${inside.id}::`),
      ),
      true,
    )
    assert.equal(
      zoneNode?.children?.some(
        (child) =>
          child.id === outside.id || child.id.startsWith(`${outside.id}::`),
      ),
      false,
    )
    assert.equal(
      tree.some((node) => node.id === outside.id),
      true,
    )
  })
})
