import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { calculateDisplayPrice } from "./display-price"

describe("calculateDisplayPrice", () => {
  it("adds the transferred commission when absorbFees is false", () => {
    assert.equal(calculateDisplayPrice(15000, 0.08, false), 16200)
    assert.equal(calculateDisplayPrice(15000, 0.08, false, 200), 16400)
  })

  it("keeps the organizer base when absorbFees is true", () => {
    assert.equal(calculateDisplayPrice(15000, 0.08, true, 200), 15000)
  })

  it("keeps free tickets at 0", () => {
    assert.equal(calculateDisplayPrice(0, 0.15, false, 200), 0)
  })
})
