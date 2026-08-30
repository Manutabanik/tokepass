import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyVenueMap } from "@/types/venue-map"

import {
  pruneVenueMapSelection,
  venueMapSelectionsEqual,
} from "./venue-map-selection"

describe("pruneVenueMapSelection", () => {
  it("clears every selection when the canvas is empty", () => {
    const empty = emptyVenueMap()
    empty.stage = null
    assert.equal(
      pruneVenueMapSelection({ kind: "element", id: "mesa-1" }, empty),
      null,
    )
    assert.equal(
      pruneVenueMapSelection({ kind: "elements", ids: ["a", "b"] }, empty),
      null,
    )
    assert.equal(
      pruneVenueMapSelection({ kind: "zone", id: "zona-1" }, empty),
      null,
    )
    assert.equal(pruneVenueMapSelection({ kind: "stage" }, empty), null)
    assert.equal(pruneVenueMapSelection(null, empty), null)
  })

  it("keeps only ids that still exist", () => {
    const map = emptyVenueMap()
    map.elements = [{ id: "keep" } as (typeof map.elements)[number]]
    assert.deepEqual(
      pruneVenueMapSelection({ kind: "elements", ids: ["gone", "keep"] }, map),
      { kind: "element", id: "keep" },
    )
    assert.deepEqual(
      pruneVenueMapSelection({ kind: "element", id: "keep" }, map),
      { kind: "element", id: "keep" },
    )
  })

  it("drops seat selection when those seats are gone", () => {
    const empty = emptyVenueMap()
    empty.stage = null
    assert.equal(
      pruneVenueMapSelection({ kind: "seats", ids: ["mesa-1::s1"] }, empty),
      null,
    )
  })
})

describe("venueMapSelectionsEqual", () => {
  it("compares ids without requiring the same object", () => {
    assert.equal(
      venueMapSelectionsEqual(
        { kind: "element", id: "a" },
        { kind: "element", id: "a" },
      ),
      true,
    )
    assert.equal(
      venueMapSelectionsEqual(
        { kind: "elements", ids: ["a", "b"] },
        { kind: "elements", ids: ["a", "b"] },
      ),
      true,
    )
    assert.equal(
      venueMapSelectionsEqual(
        { kind: "element", id: "a" },
        { kind: "element", id: "b" },
      ),
      false,
    )
  })
})
