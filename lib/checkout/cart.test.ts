import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  calculateTotal,
  cartIncludedServiceFee,
  cartItemCount,
  cartQuantityCount,
  hasActiveCheckoutSelection,
  includedServiceFee,
  sumCartAmounts,
  sumCartQuantities,
  toCartNumber,
} from "./cart"

describe("checkout cart selection", () => {
  it("counts quantity tiers and a numbered seat as active selection", () => {
    assert.equal(cartItemCount({}, false), 0)
    assert.equal(hasActiveCheckoutSelection({ general: 0 }, false), false)
    assert.equal(cartItemCount({ general: 2 }, false), 2)
    assert.equal(cartItemCount({ general: 2 }, true), 3)
    assert.equal(hasActiveCheckoutSelection({}, true), true)
  })

  it("counts free $0 tickets the same as paid tickets", () => {
    assert.equal(cartQuantityCount({ lima: 1 }), 1)
    assert.equal(cartQuantityCount({ lima: 1, pullman: 0 }), 1)
    assert.equal(hasActiveCheckoutSelection({ lima: 1 }, false), true)
  })
})

describe("calculateTotal", () => {
  it("sums stamped price times quantity including Gratis", () => {
    assert.equal(
      calculateTotal([
        { price: 0, quantity: 2 },
        { price: 15000, quantity: 1 },
      ]),
      15000,
    )
    assert.equal(calculateTotal([{ price: 0, quantity: 3 }]), 0)
  })
})

describe("cart math", () => {
  it("sums line quantities instead of unique line ids", () => {
    assert.equal(
      sumCartQuantities([
        { quantity: 2 },
        { quantity: "3" },
        { quantity: 0 },
      ]),
      5,
    )
  })

  it("multiplies unit price by quantity with numeric coercion", () => {
    assert.equal(
      sumCartAmounts([
        { price: "50000", quantity: "2" },
        { price: 10000, quantity: 1 },
      ]),
      110000,
    )
  })

  it("computes an included 10% service fee from the subtotal", () => {
    assert.equal(includedServiceFee(100000, 0.1), 10000)
    assert.equal(includedServiceFee("100000", 10), 10000)
    assert.equal(toCartNumber("10"), 10)
  })

  it("splits All-In line prices into an included service fee without raising the total", () => {
    const lines = [
      { price: 10000, quantity: 2 },
      { price: 0, quantity: 1 },
    ]
    assert.equal(cartIncludedServiceFee(lines, 0.1), 2000)
    assert.equal(cartIncludedServiceFee(lines, 0.1, 200), 2400)
    assert.equal(calculateTotal(lines), 20000)
  })
})
