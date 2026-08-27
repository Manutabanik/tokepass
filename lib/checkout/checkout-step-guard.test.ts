import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cartHasPurchasableItems,
  resolveCheckoutProgressStep,
} from "./checkout-step-guard"

describe("resolveCheckoutProgressStep", () => {
  it("keeps the buyer on tickets when stock clears the cart", () => {
    assert.equal(
      resolveCheckoutProgressStep({
        requested: "details",
        hasCartItems: false,
      }),
      "tickets",
    )
  })

  it("does not skip ahead when the event is sold out", () => {
    assert.equal(
      resolveCheckoutProgressStep({
        requested: "payment",
        hasCartItems: true,
        purchaseLocked: true,
      }),
      "tickets",
    )
  })

  it("allows details only with a live cart", () => {
    assert.equal(
      resolveCheckoutProgressStep({
        requested: "details",
        hasCartItems: true,
      }),
      "details",
    )
  })
})

describe("cartHasPurchasableItems", () => {
  it("treats empty quantities and no seats as empty", () => {
    assert.equal(cartHasPurchasableItems({ quantities: { a: 0 }, selectedCount: 0 }), false)
    assert.equal(cartHasPurchasableItems({ quantities: { a: 2 }, selectedCount: 0 }), true)
    assert.equal(cartHasPurchasableItems({ quantities: {}, selectedCount: 1 }), true)
    assert.equal(cartHasPurchasableItems({ quantities: { lima: 1 }, selectedCount: 0 }), true)
  })

  it("accepts a mesa or numbered place without general ticket qty", () => {
    assert.equal(
      cartHasPurchasableItems({
        quantities: { general: 0 },
        selectedCount: 0,
        seats: [{ id: "mesa-09" }],
      }),
      true,
    )
    assert.equal(
      cartHasPurchasableItems({
        quantities: {},
        selectedItems: [{ id: "mesa-09", type: "table" }],
      }),
      true,
    )
    assert.equal(
      cartHasPurchasableItems({
        quantities: { general: 0 },
        tickets: [],
        seats: [],
      }),
      false,
    )
  })
})
