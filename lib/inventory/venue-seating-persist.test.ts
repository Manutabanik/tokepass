import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveVenueSeatingArtifactsForPersist } from "./venue-seating-persist"
import { emptyVenueMap } from "@/types/venue-map"

describe("resolveVenueSeatingArtifactsForPersist", () => {
  it("vacía mapa y layout cuando el mapa está desactivado", () => {
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
    const resolved = resolveVenueSeatingArtifactsForPersist({
      hasSeatingPlan: false,
      includesSeatingMap: false,
      venueMap: map,
      seatingLayout: [{ id: "legacy-sector" }],
    })
    assert.equal(resolved.mapActive, false)
    assert.deepEqual(resolved.seatingLayout, [])
    assert.equal(resolved.venueMap.zones?.length ?? 0, 0)
  })

  it("conserva layout cuando el mapa está activo", () => {
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
    const resolved = resolveVenueSeatingArtifactsForPersist({
      hasSeatingPlan: true,
      includesSeatingMap: true,
      venueMap: map,
    })
    assert.equal(resolved.mapActive, true)
    assert.ok(resolved.seatingLayout.length > 0)
  })
})
