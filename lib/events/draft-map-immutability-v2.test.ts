import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ACTIVE_SALE_LAYOUT_DELETE_ERROR,
  collectDraftLayoutItemKeys,
  collectVenueMapLayoutItemIds,
  incomingKeepsLayoutItem,
  isActiveSeatingHold,
  missingProtectedLayoutItems,
} from "@/lib/events/draft-map-immutability-v2"
import { emptyEventDraftV2 } from "@/lib/validations/event-draft-v2"
import { emptyVenueMap, type InteractiveVenueMap } from "@/types/venue-map"

function plateaMap(): InteractiveVenueMap {
  return {
    ...emptyVenueMap(),
    sectors: [
      {
        id: "sector-platea",
        name: "Platea",
        color: "#f97316",
        price: 18000,
        x: 0,
        y: 0,
        rows: 1,
        seatsPerRow: 2,
        curvature: 0,
        aisle: false,
        seats: [
          { id: "s1", row: "1", number: 1, x: 0, y: 0, status: "available" },
          { id: "s2", row: "1", number: 2, x: 10, y: 0, status: "available" },
        ],
      },
    ],
  }
}

describe("draft map immutability v2", () => {
  it("collects sector and seat ids from a venue map", () => {
    const ids = collectVenueMapLayoutItemIds(plateaMap())
    assert.ok(ids.includes("sector-platea"))
    assert.ok(ids.includes("s1"))
    assert.ok(ids.includes("s2"))
  })

  it("keys draft layout items by day", () => {
    const draft = emptyEventDraftV2()
    draft.schedule = [{ id: "day-a", name: "Sábado", date: "", startDate: "", endDate: "", slots: [] }]
    draft.seatingMaps = [
      {
        dateId: "day-a",
        mapConfig: plateaMap(),
        pricing: { sectorPrices: {}, blockedSeatIds: [] },
      },
    ]
    const keys = collectDraftLayoutItemKeys(draft)
    assert.ok(keys.has("day-a::s1"))
    assert.ok(keys.has("day-a::sector-platea"))
  })

  it("blocks a sold seat missing from the incoming day map", () => {
    const incoming = new Set(["day-a::s2", "day-a::sector-platea"])
    const missing = missingProtectedLayoutItems(incoming, [
      { itemId: "s1", dateId: "day-a" },
    ])
    assert.equal(missing.length, 1)
    assert.equal(missing[0]?.itemId, "s1")
  })

  it("keeps a sold seat present on the same day", () => {
    const incoming = new Set(["day-a::s1"])
    assert.equal(incomingKeepsLayoutItem(incoming, "s1", "day-a"), true)
    assert.equal(
      missingProtectedLayoutItems(incoming, [{ itemId: "s1", dateId: "day-a" }])
        .length,
      0,
    )
  })

  it("treats reserved and unexpired holds as active sales", () => {
    assert.equal(isActiveSeatingHold({ status: "sold" }), true)
    assert.equal(isActiveSeatingHold({ status: "reserved" }), true)
    assert.equal(
      isActiveSeatingHold({
        status: "available",
        reservedUntil: new Date(Date.now() + 60_000).toISOString(),
      }),
      true,
    )
    assert.equal(
      isActiveSeatingHold({
        status: "available",
        reservedUntil: new Date(Date.now() - 60_000).toISOString(),
      }),
      false,
    )
  })

  it("exposes the organizer-facing block copy", () => {
    assert.match(ACTIVE_SALE_LAYOUT_DELETE_ERROR, /bloqueado/)
  })
})
