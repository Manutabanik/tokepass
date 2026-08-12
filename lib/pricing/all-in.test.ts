import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { allInBreakdown } from "./all-in"

describe("all-in pricing", () => {
  it("splits a public price using the organizer rate", () => {
    assert.deepEqual(allInBreakdown(10000, 0.1), {
      basePrice: 9000,
      platformFee: 1000,
      publicPrice: 10000,
      rate: 0.1,
      fixedFee: 0,
    })
  })

  it("rounds to 2 decimals", () => {
    assert.deepEqual(allInBreakdown(33.33, 0.15), {
      basePrice: 28.33,
      platformFee: 5,
      publicPrice: 33.33,
      rate: 0.15,
      fixedFee: 0,
    })
  })

  it("clamps negative prices to zero", () => {
    assert.deepEqual(allInBreakdown(-10, 0.15), {
      basePrice: 0,
      platformFee: 0,
      publicPrice: 0,
      rate: 0.15,
      fixedFee: 0,
    })
  })

  it("clamps rates to the supported range", () => {
    assert.equal(allInBreakdown(100, 2).platformFee, 95)
    assert.equal(allInBreakdown(100, -1).platformFee, 0)
  })

  it("adds a fixed fee inside the All-In split", () => {
    assert.deepEqual(allInBreakdown(10000, 0.08, 200), {
      basePrice: 9000,
      platformFee: 1000,
      publicPrice: 10000,
      rate: 0.08,
      fixedFee: 200,
    })
  })

  it("ignores fixed fee on free tickets", () => {
    assert.deepEqual(allInBreakdown(0, 0.08, 200), {
      basePrice: 0,
      platformFee: 0,
      publicPrice: 0,
      rate: 0.08,
      fixedFee: 0,
    })
  })
})
