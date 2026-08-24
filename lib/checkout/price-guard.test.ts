import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CHECKOUT_PRICES_CHANGED_ERROR,
  displayedTotalMatchesServer,
} from "./price-guard"

describe("displayedTotalMatchesServer", () => {
  it("ignores a missing client total and never treats it as the charge amount", () => {
    assert.equal(displayedTotalMatchesServer(undefined, 12000), true)
    assert.equal(displayedTotalMatchesServer(null, 0), true)
  })

  it("rejects a stale cart total against the server quote", () => {
    assert.equal(displayedTotalMatchesServer(10000, 12000), false)
    assert.equal(displayedTotalMatchesServer(0, 1500), false)
    assert.equal(CHECKOUT_PRICES_CHANGED_ERROR.includes("precios han cambiado"), true)
  })

  it("accepts an exact All-In match including free orders", () => {
    assert.equal(displayedTotalMatchesServer(0, 0), true)
    assert.equal(displayedTotalMatchesServer(15500.5, 15500.5), true)
  })
})
