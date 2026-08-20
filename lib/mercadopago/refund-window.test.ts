import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  MERCADO_PAGO_REFUND_WINDOW_DAYS,
  isWithinMercadoPagoRefundWindow,
  parseMercadoPagoPaidAt,
} from "@/lib/mercadopago/refund-window"

describe("Mercado Pago refund window", () => {
  it("parses ISO paid-at dates", () => {
    const paid = parseMercadoPagoPaidAt("2026-01-01T12:00:00.000Z")
    assert.ok(paid)
    assert.equal(paid?.toISOString(), "2026-01-01T12:00:00.000Z")
  })

  it("allows a refund inside the 180-day window", () => {
    const paidAt = new Date("2026-01-01T00:00:00.000Z")
    const now = new Date("2026-03-01T00:00:00.000Z")
    assert.equal(isWithinMercadoPagoRefundWindow(paidAt, now), true)
  })

  it("blocks a refund after the official window", () => {
    const paidAt = new Date("2025-01-01T00:00:00.000Z")
    const now = new Date("2026-08-01T00:00:00.000Z")
    assert.equal(
      isWithinMercadoPagoRefundWindow(
        paidAt,
        now,
        MERCADO_PAGO_REFUND_WINDOW_DAYS,
      ),
      false,
    )
  })

  it("fails closed when the original charge date is missing", () => {
    assert.equal(isWithinMercadoPagoRefundWindow(null), false)
    assert.equal(isWithinMercadoPagoRefundWindow("no-es-fecha"), false)
  })
})
