import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isAllowedPaymentCurrency,
  normalizePaymentCurrency,
  REQUIRED_PAYMENT_CURRENCY,
} from "./currency"

describe("payment currency", () => {
  it("requires ARS", () => {
    assert.equal(REQUIRED_PAYMENT_CURRENCY, "ARS")
    assert.equal(isAllowedPaymentCurrency("ARS"), true)
    assert.equal(isAllowedPaymentCurrency("ars"), true)
    assert.equal(isAllowedPaymentCurrency(" USD "), false)
    assert.equal(isAllowedPaymentCurrency(""), false)
    assert.equal(isAllowedPaymentCurrency(null), false)
    assert.equal(normalizePaymentCurrency(" ars "), "ARS")
  })
})
