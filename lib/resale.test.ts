import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  computeResaleFeeSplit,
  DEFAULT_RESALE_FEE_PERCENTAGE,
  formatResaleFeePercentage,
  normalizeResaleFeePercentage,
} from "./resale"

describe("resale fee split", () => {
  it("defaults to the platform 10 percent fee", () => {
    const split = computeResaleFeeSplit(10000)
    assert.equal(split.feePercentage, DEFAULT_RESALE_FEE_PERCENTAGE)
    assert.equal(split.platformFeeAmount, 1000)
    assert.equal(split.sellerNetAmount, 9000)
  })

  it("uses a configured fee percentage", () => {
    const split = computeResaleFeeSplit(15000, 15)
    assert.equal(split.price, 15000)
    assert.equal(split.feePercentage, 15)
    assert.equal(split.platformFeeAmount, 2250)
    assert.equal(split.sellerNetAmount, 12750)
  })

  it("clamps invalid percentages to the safe range", () => {
    assert.equal(normalizeResaleFeePercentage(-4), 0)
    assert.equal(normalizeResaleFeePercentage(140), 100)
    assert.equal(normalizeResaleFeePercentage("abc"), DEFAULT_RESALE_FEE_PERCENTAGE)
    assert.equal(formatResaleFeePercentage(12.5), "12.5")
  })
})
