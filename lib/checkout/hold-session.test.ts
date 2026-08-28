import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isCheckoutHoldSessionId,
  normalizeCheckoutHoldSessionId,
} from "./hold-session"

describe("checkout hold session id", () => {
  it("accepts a cart UUID and rejects empty or junk values", () => {
    const id = "2f1c8a6e-4b21-4c0d-9e8a-7b6c5d4e3f20"
    assert.equal(isCheckoutHoldSessionId(id), true)
    assert.equal(normalizeCheckoutHoldSessionId(` ${id} `), id)
    assert.equal(isCheckoutHoldSessionId(""), false)
    assert.equal(isCheckoutHoldSessionId("cart-now"), false)
    assert.equal(normalizeCheckoutHoldSessionId("cart-now"), null)
    assert.equal(isCheckoutHoldSessionId(crypto.randomUUID()), true)
  })
})
