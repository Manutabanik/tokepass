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
    assert.equal(
      errors.buyerPhone,
      "Ingresá tu número con el código de área (ej: 1112345678)",
    )
    assert.equal(firstCheckoutBuyerErrorField(errors), "buyerPhone")
    const result = validateCheckoutBuyer({
      buyerName: "Ana Pérez",
      buyerDni: "30111222",
      buyerPhone: "123",
      buyerEmail: "ana@tokepass.com",
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(
        result.error,
        "Ingresá tu número con el código de área (ej: 1112345678)",
      )
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

  it("blocks an empty form and focuses mail first", () => {
    const errors = getCheckoutBuyerFieldErrors({
      buyerName: "",
      buyerDni: "",
      buyerPhone: "",
      buyerEmail: "",
    })
    assert.equal(firstCheckoutBuyerErrorField(errors), "buyerEmail")
    assert.ok(errors.buyerEmail)
    assert.ok(errors.buyerName)
    assert.ok(errors.buyerDni)
    assert.ok(errors.buyerPhone)
  })

  it("allows a free checkout without phone", () => {
    const input = {
      buyerName: "Ana Pérez",
      buyerDni: "30111222",
      buyerPhone: "",
      buyerEmail: "ana@tokepass.com",
    }
    const errors = getCheckoutBuyerFieldErrors(input, { requirePhone: false })
    assert.deepEqual(errors, {})
    const result = validateCheckoutBuyer(input, { requirePhone: false })
    assert.equal(result.ok, true)
  })
})
