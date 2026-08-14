import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  hexToRgba,
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
})
