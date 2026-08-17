import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  additionalUnitsAfterHold,
  occupiedDayUnits,
  peakOccupiedVenueUnits,
  venueRemainingAfterPurchase,
} from "./cascade-stock"

const tiers = [
  { dayId: "d1", sold: 100, tierType: "general" },
  { dayId: "d2", sold: 40, tierType: "general" },
  { dayId: null, sold: 50, tierType: "general" },
  { dayId: "d1", sold: 10, tierType: "bundle" },
  { dayId: "d1", sold: 5, tierType: "addon" },
]

describe("cascade stock occupancy", () => {
  it("does not release held units when converting a matching hold", () => {
    assert.equal(additionalUnitsAfterHold(3, 3), 0)
  })

  it("asks only for the delta when the hold is smaller than the cart", () => {
    assert.equal(additionalUnitsAfterHold(2, 5), 3)
  })

  it("adds full-pass sold to every day and ignores bundle parents and addons", () => {
    assert.equal(occupiedDayUnits("d1", tiers), 150)
    assert.equal(occupiedDayUnits("d2", tiers), 90)
  })

  it("uses peak night occupancy as the venue ceiling", () => {
    assert.equal(peakOccupiedVenueUnits(["d1", "d2"], tiers), 150)
  })

  it("rejects a full-pass when any night is at venue cap", () => {
    const remaining = venueRemainingAfterPurchase({
      venueCap: 150,
      occupied: occupiedDayUnits("d1", tiers),
      additional: 1,
    })
    assert.equal(remaining, -1)
  })
})
