import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"

import {
  resolveMapUnitTierId,
  seatingLayoutUnitDrafts,
} from "./reconcile-map-seating-units"

function tableMap() {
  const map = emptyVenueMap()
  map.elements = [
    {
      id: "mesa-08",
      type: "long_table",
      label: "Tablón 08",
      category: "commercial",
      sectorName: "Grada Amarilla",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      rotation: 0,
      price: 12000,
      color: "#eab308",
      opacity: 1,
      chairCount: 8,
      sideA: 4,
      sideB: 4,
      sellMode: "group",
      capacity: 8,
      groupId: "grada-amarilla",
      zoneId: "grada-amarilla",
      ticketTypeId: "tier-grada",
      seats: [
        { id: "mesa-08-S1", number: 1, x: 0, y: 0, status: "available" },
        { id: "mesa-08-S2", number: 2, x: 10, y: 0, status: "available" },
      ],
    },
  ]
  map.zones = [
    {
      id: "grada-amarilla",
      name: "Grada Amarilla",
      color: "#eab308",
      price: 12000,
      polygon: [],
      layoutType: "general",
      sellMode: "group",
      rows: 0,
      itemsPerRow: 0,
      capacityPerUnit: 8,
      capacity: 8,
      labelPrefix: "T",
    },
  ]
  return map
}

describe("reconcile map seating units", () => {
  it("drafts a table_combo unit with the SVG element id", () => {
    const drafts = seatingLayoutUnitDrafts(tableMap())
    const table = drafts.find((draft) => draft.layoutItemId === "mesa-08")
    assert.ok(table)
    assert.equal(table?.layoutType, "table_combo")
    assert.equal(table?.capacityPerUnit, 2)
    assert.equal(table?.ticketTypeId, "tier-grada")
    assert.equal(
      drafts.some((draft) => draft.layoutItemId === "mesa-08-S1"),
      false,
    )
  })

  it("uses the assigned ticket type, then a fallback seated tier", () => {
    const draft = seatingLayoutUnitDrafts(tableMap())[0]!
    assert.equal(
      resolveMapUnitTierId(draft, [
        {
          id: "tier-grada",
          seatingSectorId: "grada-amarilla",
          layoutType: "table_combo",
          visibility: "public",
        },
      ]),
      "tier-grada",
    )
    assert.equal(
      resolveMapUnitTierId(
        { ...draft, ticketTypeId: undefined },
        [
          {
            id: "tier-ga",
            seatingSectorId: null,
            layoutType: "general",
            visibility: "public",
            ticketType: "standard",
          },
          {
            id: "tier-mesa",
            seatingSectorId: "otro",
            layoutType: "table_combo",
            visibility: "hidden",
            ticketType: "standard",
          },
        ],
      ),
      "tier-mesa",
    )
  })
})
