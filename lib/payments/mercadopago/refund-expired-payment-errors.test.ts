import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isMercadoPagoAlreadyRefundedError } from "./refund-expired-payment-errors"

describe("isMercadoPagoAlreadyRefundedError", () => {
  it("treats a second refund as success so the cron can move on", () => {
    assert.equal(
      isMercadoPagoAlreadyRefundedError(
        new Error("The payment already has a refund"),
      ),
      true,
    )
    assert.equal(
      isMercadoPagoAlreadyRefundedError("collected_money_refunded"),
      true,
    )
    assert.equal(
      isMercadoPagoAlreadyRefundedError(new Error("mp_refund_http_500")),
      false,
    )
  })
})
