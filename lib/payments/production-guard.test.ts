import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { PaymentProviderNotSupportedError } from "./core/errors"
import { assertSecondaryPspDisabledInProduction } from "./production-guard"

describe("secondary PSP production guard", () => {
  it("blocks Naranja X and Payway when VERCEL_ENV is production", () => {
    const previous = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = "production"
    try {
      assert.throws(
        () => assertSecondaryPspDisabledInProduction("naranjax"),
        PaymentProviderNotSupportedError,
      )
      assert.throws(
        () => assertSecondaryPspDisabledInProduction("payway"),
        PaymentProviderNotSupportedError,
      )
      assert.doesNotThrow(() =>
        assertSecondaryPspDisabledInProduction("mercadopago"),
      )
    } finally {
      if (previous == null) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previous
    }
  })
})
