import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  firstValidPublicPrice,
  isValidPublicPrice,
  mapSelectionUnitPrice,
  publicOfferPrice,
  skuUnitPriceFromTiers,
} from "./public-price"

describe("public price", () => {
  it("treats 0 as a valid Gratis price", () => {
    assert.equal(isValidPublicPrice(0), true)
    assert.equal(isValidPublicPrice(1500), true)
    assert.equal(isValidPublicPrice(null), false)
    assert.equal(isValidPublicPrice(undefined), false)
    assert.equal(isValidPublicPrice(Number.NaN), false)
    assert.equal(isValidPublicPrice(-1), false)
  })

  it("keeps the first finite price including 0", () => {
    assert.equal(firstValidPublicPrice(0, 18000), 0)
    assert.equal(firstValidPublicPrice(undefined, 0, 18000), 0)
    assert.equal(firstValidPublicPrice(null, undefined, 2500), 2500)
  })

  it("keeps the card offer price on the same SKU", () => {
    assert.equal(publicOfferPrice({ price: 155969 }), 155969)
    assert.equal(publicOfferPrice({ price: 0 }), 0)
    assert.equal(
      skuUnitPriceFromTiers(
        "tier-general",
        [
          { id: "tier-general", price: 155969 },
          { id: "tier-parking", price: 673391 },
        ],
        673391,
      ),
      155969,
    )
  })

  it("keeps a stamped Gratis price instead of the parent SKU", () => {
    assert.equal(
      mapSelectionUnitPrice(0, "tier-general", [
        { id: "tier-general", price: 50000 },
      ]),
      0,
    )
    assert.equal(
      mapSelectionUnitPrice(undefined, "tier-general", [
        { id: "tier-general", price: 50000 },
      ]),
      50000,
    )
  })

  it("uses the active phase price when the card would show it", () => {
    assert.equal(
      publicOfferPrice({
        price: 200000,
        phases: [
          {
            id: "p1",
            name: "Preventa",
            price: 155969,
            capacityLimit: 100,
            sold: 0,
            startTime: null,
            endTime: null,
            status: "active",
          },
        ],
      }),
      155969,
    )
  })
})
