import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatHoldCountdown } from "./checkout-hold"

describe("hold countdown", () => {
  it("formats MM:SS with padded digits", () => {
    assert.equal(formatHoldCountdown(600), "10:00")
    assert.equal(formatHoldCountdown(61), "01:01")
    assert.equal(formatHoldCountdown(0), "00:00")
  })

  it("never goes below zero", () => {
    assert.equal(formatHoldCountdown(-12), "00:00")
  })
})
