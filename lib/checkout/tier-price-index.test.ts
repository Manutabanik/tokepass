import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildTierUnitPriceIndex, unitPriceForTierId } from "./tier-price-index"

describe("tier unit price index", () => {
  it("indexes by ticket id and unique sector id, never by display name", () => {
    const prices = buildTierUnitPriceIndex([
      { id: "tier-general", price: 18000, seatingSectorId: "sec-ga" },
      { id: "tier-parking", price: 5000, seatingSectorId: null },
    ])
    assert.equal(prices["tier-general"], 18000)
    assert.equal(prices["sec-ga"], 18000)
    assert.equal(prices["tier-parking"], 5000)
    assert.equal(prices.General, undefined)
    assert.equal(prices.Estacionamiento, undefined)
  })

  it("does not share a sector key when two tickets reuse the same sector", () => {
    const prices = buildTierUnitPriceIndex([
      { id: "vie", price: 10000, seatingSectorId: "campo" },
      { id: "sab", price: 12000, seatingSectorId: "campo" },
    ])
    assert.equal(prices.vie, 10000)
    assert.equal(prices.sab, 12000)
    assert.equal(prices.campo, undefined)
  })

  it("reads a unit price by ticket id", () => {
    const prices = buildTierUnitPriceIndex([
      { id: "tier-general", price: 18000 },
    ])
    assert.equal(unitPriceForTierId("tier-general", prices, 1), 18000)
    assert.equal(unitPriceForTierId("missing", prices, 9), 9)
  })
})
