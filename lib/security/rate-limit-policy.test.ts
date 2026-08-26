import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { RATE_LIMITS } from "./rate-limit-policy"

describe("checkout rate-limit policy", () => {
  it("caps cart holds per user and per IP", () => {
    assert.equal(RATE_LIMITS.cartHoldUser.limit, 20)
    assert.equal(RATE_LIMITS.cartHoldUser.windowSeconds, 60)
    assert.equal(RATE_LIMITS.cartHoldIp.limit, 40)
    assert.equal(RATE_LIMITS.cartHoldIp.windowSeconds, 60)
    assert.equal(RATE_LIMITS.checkoutIp.limit, 8)
    assert.equal(RATE_LIMITS.checkoutEdgeIp.limit, 80)
    assert.equal(RATE_LIMITS.promoValidateIp.limit, 8)
    assert.equal(RATE_LIMITS.promoValidateUser.limit, 12)
  })
})
