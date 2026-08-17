import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CHECKOUT_FULFILLMENT_PURPOSE,
  checkoutFulfillmentCookieAttrs,
  fulfillmentTokenMatchesOrder,
  signCheckoutFulfillmentToken,
  verifyCheckoutFulfillmentToken,
} from "./fulfillment-token"

const ORDER_A = "11111111-1111-4111-8111-111111111111"
const ORDER_B = "22222222-2222-4222-8222-222222222222"

describe("checkout fulfillment token", () => {
  it("roundtrips a signed token bound to order_id", async () => {
    process.env.CHECKOUT_FULFILLMENT_SECRET = "tokepass-test-fulfillment-secret"
    const token = await signCheckoutFulfillmentToken(ORDER_A)
    assert.equal(await verifyCheckoutFulfillmentToken(token), ORDER_A)
    assert.equal(await fulfillmentTokenMatchesOrder(token, ORDER_A), true)
    assert.equal(await fulfillmentTokenMatchesOrder(token, ORDER_B), false)
  })

  it("rejects empty, garbage, and missing tokens", async () => {
    process.env.CHECKOUT_FULFILLMENT_SECRET = "tokepass-test-fulfillment-secret"
    assert.equal(await verifyCheckoutFulfillmentToken(""), null)
    assert.equal(await verifyCheckoutFulfillmentToken("not-a-jwt"), null)
    assert.equal(await verifyCheckoutFulfillmentToken(null), null)
  })

  it("sets a short-lived httpOnly cookie on /", () => {
    const attrs = checkoutFulfillmentCookieAttrs()
    assert.equal(attrs.httpOnly, true)
    assert.equal(attrs.sameSite, "lax")
    assert.equal(attrs.path, "/")
    assert.equal(attrs.maxAge, 20 * 60)
  })

  it("embeds the checkout-fulfillment purpose claim", async () => {
    process.env.CHECKOUT_FULFILLMENT_SECRET = "tokepass-test-fulfillment-secret"
    const token = await signCheckoutFulfillmentToken(ORDER_A)
    const parts = token.split(".")
    assert.equal(parts.length, 3)
    const payload = JSON.parse(
      Buffer.from(parts[1] ?? "", "base64url").toString("utf8"),
    ) as { purpose?: string; sub?: string }
    assert.equal(payload.purpose, CHECKOUT_FULFILLMENT_PURPOSE)
    assert.equal(payload.sub, ORDER_A)
  })
})
