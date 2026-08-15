import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getCheckoutBuyerFieldErrors,
  validateCheckoutBuyer,
} from "./checkout-buyer"
import { firstCheckoutBuyerErrorField } from "./checkout/validation-scroll"

describe("checkout buyer field errors", () => {
  it("points to the first invalid field instead of a generic toast-only error", () => {
    const errors = getCheckoutBuyerFieldErrors({
      buyerName: "Ana Pérez",
      buyerDni: "30111222",
      buyerPhone: "123",
      buyerEmail: "ana@tokepass.com",
    })
    assert.equal(errors.buyerPhone, "Ingresá un celular argentino con código de área.")
    assert.equal(firstCheckoutBuyerErrorField(errors), "buyerPhone")
    const result = validateCheckoutBuyer({
      buyerName: "Ana Pérez",
      buyerDni: "30111222",
      buyerPhone: "123",
      buyerEmail: "ana@tokepass.com",
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error, "Ingresá un celular argentino con código de área.")
    }
  })

  it("accepts a complete buyer", () => {
    const result = validateCheckoutBuyer({
      buyerName: "Ana Pérez",
      buyerDni: "30111222",
      buyerPhone: "1123456789",
      buyerEmail: "ana@tokepass.com",
    })
    assert.equal(result.ok, true)
    assert.deepEqual(getCheckoutBuyerFieldErrors({
      buyerName: "Ana Pérez",
      buyerDni: "30111222",
      buyerPhone: "1123456789",
      buyerEmail: "ana@tokepass.com",
    }), {})
  })
})
