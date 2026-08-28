import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildCheckoutGuestAuthInput,
  isCheckoutGuestEmail,
} from "./guest-credentials"

describe("checkout guest credentials", () => {
  it("builds a unique guest email without using public signup", () => {
    const first = buildCheckoutGuestAuthInput()
    const second = buildCheckoutGuestAuthInput()
    assert.notEqual(first.email, second.email)
    assert.ok(isCheckoutGuestEmail(first.email))
    assert.ok(first.password.length >= 16)
  })
})
