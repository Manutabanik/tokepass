import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  hexToRgba,
  occupancyFromSeatingUnits,
  resolveLiveVenueSeatStatus,
} from "./venue-map-occupancy"

describe("venue-map-occupancy", () => {
  it("blocks map-blocked seats even if occupancy is available", () => {
    assert.equal(
      resolveLiveVenueSeatStatus({
        mapStatus: "blocked",
        occupancy: "available",
        selected: true,
      }),
      "blocked",
    )
  })

  it("marks occupied seats over selection", () => {
    assert.equal(
      resolveLiveVenueSeatStatus({
        mapStatus: "available",
        occupancy: "occupied",
        selected: true,
      }),
      "occupied",
    )
  })

  it("converts hex to rgba", () => {
    assert.equal(hexToRgba("#10b981", 0.2), "rgba(16, 185, 129, 0.2)")
  })

  it("marks unpublished layout items occupied after a live fetch", () => {
    const occupancy = occupancyFromSeatingUnits(
      [{ layoutItemId: "a-1", status: "available" }],
      ["a-1", "a-2"],
    )
    assert.equal(occupancy["a-1"], "available")
    assert.equal(occupancy["a-2"], "occupied")
  })
})
