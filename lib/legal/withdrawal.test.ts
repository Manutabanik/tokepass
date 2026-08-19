import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isEventFarEnoughForWithdrawal,
  isGatewayRefundSuccess,
  isLocallyRefundablePayment,
  isWithinWithdrawalWindow,
} from "@/lib/legal/withdrawal"

describe("withdrawal windows", () => {
  it("acepta hasta 10 dias desde el pago", () => {
    const paid = new Date("2026-08-01T12:00:00.000Z")
    assert.equal(
      isWithinWithdrawalWindow(paid, new Date("2026-08-11T12:00:00.000Z")),
      true,
    )
    assert.equal(
      isWithinWithdrawalWindow(paid, new Date("2026-08-11T12:00:01.000Z")),
      false,
    )
  })

  it("exige 24 horas antes del inicio del evento", () => {
    const start = new Date("2026-08-20T22:00:00.000Z")
    assert.equal(
      isEventFarEnoughForWithdrawal(start, new Date("2026-08-19T22:00:00.000Z")),
      true,
    )
    assert.equal(
      isEventFarEnoughForWithdrawal(start, new Date("2026-08-19T22:00:01.000Z")),
      false,
    )
  })

  it("solo trata como éxito de pasarela un refund real", () => {
    assert.equal(isGatewayRefundSuccess({ success: true, mode: "platform" }), true)
    assert.equal(isGatewayRefundSuccess({ success: true, mode: "mock" }), false)
    assert.equal(isLocallyRefundablePayment({ paymentMethod: "cash_pos" }), true)
    assert.equal(
      isLocallyRefundablePayment({
        paymentMethod: "mercadopago",
        mpPaymentId: "123",
      }),
      false,
    )
  })
})
