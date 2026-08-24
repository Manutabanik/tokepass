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

  it("indexes a free ticket at price 0", () => {
    const prices = buildTierUnitPriceIndex([
      { id: "tier-free", price: 0, seatingSectorId: "campo" },
    ])
    assert.equal(prices["tier-free"], 0)
    assert.equal(prices.campo, 0)
    assert.equal(unitPriceForTierId("tier-free", prices, 99), 0)
  })

  it("reads a unit price by ticket id", () => {
    const prices = buildTierUnitPriceIndex([
      { id: "tier-general", price: 18000 },
    ])
    assert.equal(unitPriceForTierId("tier-general", prices, 1), 18000)
    assert.equal(unitPriceForTierId("missing", prices, 9), 9)
  })

  it("never lets another SKU sector key overwrite a ticket price", () => {
    const generalId = "tier-general"
    const prices = buildTierUnitPriceIndex([
      { id: generalId, price: 155969, seatingSectorId: "sec-ga" },
      {
        id: "tier-parking",
        price: 673391,
        seatingSectorId: generalId,
      },
    ])
    assert.equal(prices[generalId], 155969)
    assert.equal(prices["tier-parking"], 673391)
    assert.equal(unitPriceForTierId(generalId, prices, 1), 155969)

    const dayScoped = buildTierUnitPriceIndex([
      { id: generalId, price: 155969, seatingSectorId: "sec-ga" },
      {
        id: "tier-parking",
        price: 673391,
        seatingSectorId: generalId,
      },
      { id: "tier-naranja", price: 50000, seatingSectorId: "sec-naranja" },
    ])
    const merged = { ...prices, ...dayScoped }
    assert.equal(unitPriceForTierId(generalId, merged, 1), 155969)
    assert.equal(unitPriceForTierId("tier-parking", merged, 1), 673391)
  })
})
