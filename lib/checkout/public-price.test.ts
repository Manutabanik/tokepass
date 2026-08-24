import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { firstValidPublicPrice, isValidPublicPrice } from "./public-price"

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
})
