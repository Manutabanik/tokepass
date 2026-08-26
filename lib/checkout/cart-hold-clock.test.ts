import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { GA_CHECKOUT_HOLD_MS, SEATING_HOLD_MINUTES } from "@/lib/checkout-hold"

import {
  cartHasHoldableItems,
  formatCartHoldClock,
  isCartHoldExpired,
  nextCartHoldExpiresAt,
  remainingHoldSeconds,
} from "./cart-hold-clock"

describe("cart hold clock", () => {
  it("starts a 15-minute reservation from the first cart item", () => {
    assert.equal(SEATING_HOLD_MINUTES, 15)
    const now = Date.parse("2026-08-25T18:00:00.000Z")
    const expires = nextCartHoldExpiresAt(now)
    assert.equal(Date.parse(expires), now + GA_CHECKOUT_HOLD_MS)
    assert.equal(formatCartHoldClock(expires, now), "15:00")
    assert.equal(remainingHoldSeconds(expires, now), 15 * 60)
  })

  it("treats 00:00 as expired", () => {
    const now = Date.parse("2026-08-25T18:15:00.000Z")
    const expires = "2026-08-25T18:15:00.000Z"
    assert.equal(isCartHoldExpired(expires, now), true)
    assert.equal(formatCartHoldClock(expires, now), "00:00")
  })

  it("starts only when the cart has items", () => {
    assert.equal(cartHasHoldableItems({ lines: [], quantities: {}, itemsCount: 0 }), false)
    assert.equal(
      cartHasHoldableItems({
        lines: [{ quantity: 1 }],
        quantities: {},
        itemsCount: 0,
      }),
      true,
    )
  })
})
