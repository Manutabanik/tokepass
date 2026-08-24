import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  EMPTY_MAP_ENABLE_ERROR,
  eventHasActiveSeatingMap,
  seatingMapIsEnabled,
  shouldEnforceVenueMapSku,
  venueMapHasConfiguredSectors,
} from "./map-enablement"
import { emptyVenueMap } from "@/types/venue-map"

describe("map enablement", () => {
  it("rejects an empty map and accepts a drawn sector", () => {
    assert.equal(venueMapHasConfiguredSectors(null), false)
    assert.equal(venueMapHasConfiguredSectors(emptyVenueMap()), false)

    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 100,
        labelPrefix: "Campo ",
      },
    ]
    assert.equal(venueMapHasConfiguredSectors(map), true)
    assert.equal(EMPTY_MAP_ENABLE_ERROR.includes("sector"), true)
  })

  it("requires both seating flags to treat the map as enabled", () => {
    assert.equal(
      seatingMapIsEnabled({ hasSeatingPlan: true, includesSeatingMap: true }),
      true,
    )
    assert.equal(
      seatingMapIsEnabled({ hasSeatingPlan: true, includesSeatingMap: false }),
      false,
    )
  })

  it("treats the map as inactive without flags or configured sectors", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 100,
        labelPrefix: "Campo ",
      },
    ]
    assert.equal(
      eventHasActiveSeatingMap({
        hasSeatingPlan: true,
        includesSeatingMap: false,
        venueMap: map,
      }),
      false,
    )
    assert.equal(
      eventHasActiveSeatingMap({
        hasSeatingPlan: true,
        includesSeatingMap: true,
        venueMap: emptyVenueMap(),
      }),
      false,
    )
    assert.equal(
      eventHasActiveSeatingMap({
        hasSeatingPlan: true,
        includesSeatingMap: true,
        venueMap: map,
      }),
      true,
    )
  })

  it("skips SKU enforcement for general tickets without map sectors", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "zone-campo",
        name: "Campo",
        color: "#22d3ee",
        price: 8000,
        polygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
        ],
        layoutType: "general",
        sellMode: "group",
        rows: 1,
        itemsPerRow: 1,
        capacityPerUnit: 1,
        capacity: 100,
        labelPrefix: "Campo ",
      },
    ]
    assert.equal(
      shouldEnforceVenueMapSku({
        hasSeatingPlan: true,
        includesSeatingMap: true,
        venueMap: map,
        tickets: [{ seatingSectorId: null }],
      }),
      false,
    )
    assert.equal(
      shouldEnforceVenueMapSku({
        hasSeatingPlan: true,
        includesSeatingMap: true,
        venueMap: map,
        tickets: [{ seatingSectorId: "zone-campo" }],
      }),
      true,
    )
  })
})
