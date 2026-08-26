import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CHECKOUT_PRICES_CHANGED_ERROR,
  displayedTotalMatchesServer,
  liveCheckoutTiersCoverCart,
} from "./price-guard"

describe("displayedTotalMatchesServer", () => {
  it("ignores a missing client total and never treats it as the charge amount", () => {
    assert.equal(displayedTotalMatchesServer(undefined, 12000), true)
    assert.equal(displayedTotalMatchesServer(null, 0), true)
  })

  it("rejects a stale cart total against the server quote", () => {
    assert.equal(displayedTotalMatchesServer(10000, 12000), false)
    assert.equal(displayedTotalMatchesServer(0, 1500), false)
    assert.equal(
      CHECKOUT_PRICES_CHANGED_ERROR,
      "Los precios o el inventario han sido actualizados. Revisa tu carrito.",
    )
  })

  it("accepts an exact All-In match including free orders", () => {
    assert.equal(displayedTotalMatchesServer(0, 0), true)
    assert.equal(displayedTotalMatchesServer(15500.5, 15500.5), true)
  })
})

describe("liveCheckoutTiersCoverCart", () => {
  const tierId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

  it("rejects deleted or inactive ticket_tiers before payment", () => {
    assert.equal(
      liveCheckoutTiersCoverCart([tierId], []).ok,
      false,
    )
    assert.equal(
      liveCheckoutTiersCoverCart(
        [tierId],
        [{ id: tierId, price: 4000, is_active: false }],
      ).ok,
      false,
    )
    const missing = liveCheckoutTiersCoverCart([tierId], [])
    assert.equal(missing.ok, false)
    if (!missing.ok) {
      assert.equal(missing.error, CHECKOUT_PRICES_CHANGED_ERROR)
    }
  })

  it("accepts live public SKUs with a finite All-In price", () => {
    assert.equal(
      liveCheckoutTiersCoverCart(
        [tierId],
        [{ id: tierId, price: 0, visibility: "public" }],
      ).ok,
      true,
    )
  })
})
