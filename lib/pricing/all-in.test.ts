import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  allInBreakdown,
  allInPlatformFee,
  allInPublicPrice,
  DEFAULT_ALL_IN_RATE,
} from "./all-in"

describe("all-in pricing", () => {
  it("marks up net 50000 to public 57500 with 15%", () => {
    assert.equal(allInPublicPrice(50000), 57500)
    assert.equal(allInPlatformFee(50000), 7500)
    assert.deepEqual(allInBreakdown(50000), {
      basePrice: 50000,
      platformFee: 7500,
      publicPrice: 57500,
      rate: DEFAULT_ALL_IN_RATE,
    })
  })

  it("rounds to 2 decimals", () => {
    assert.equal(allInPublicPrice(33.33), 38.33)
    assert.equal(allInPlatformFee(33.33), 5)
  })

  it("clamps negative bases to zero", () => {
    assert.equal(allInPublicPrice(-10), 0)
    assert.equal(allInPlatformFee(-10), 0)
  })

  it("respects custom rates", () => {
    assert.equal(allInPublicPrice(100, 0.1), 110)
    assert.equal(allInPlatformFee(100, 0.1), 10)
  })
})
