import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cartItemCount, hasActiveCheckoutSelection } from "./cart"

describe("checkout cart selection", () => {
  it("counts quantity tiers and a numbered seat as active selection", () => {
    assert.equal(cartItemCount({}, false), 0)
    assert.equal(hasActiveCheckoutSelection({ general: 0 }, false), false)
    assert.equal(cartItemCount({ general: 2 }, false), 2)
    assert.equal(cartItemCount({ general: 2 }, true), 3)
    assert.equal(hasActiveCheckoutSelection({}, true), true)
  })
})
