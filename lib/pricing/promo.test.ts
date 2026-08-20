import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { moneyToCents } from "@/lib/money/cents"
import { applyPromoToEventSubtotal, computePromoDiscount } from "@/lib/pricing/promo"

describe("promo discount on event subtotal", () => {
  it("aplica el porcentaje solo sobre el subtotal", () => {
    assert.equal(
      computePromoDiscount({
        discountType: "percentage",
        discountValue: 10,
        subtotal: 10000,
      }),
      1000,
    )
  })

  it("no deja que un 80% conserve el fee original", () => {
    const priced = applyPromoToEventSubtotal({
      subtotal: 10000,
      discountType: "percentage",
      discountValue: 80,
      rate: 0.15,
    })

    assert.equal(priced.subtotal, 2000)
    assert.equal(priced.total, 2000)
    assert.equal(priced.serviceCharge, 300)
    assert.equal(moneyToCents(priced.subtotal), 200000)
    assert.notEqual(priced.serviceCharge, 1500)
  })

  it("recalcula all-in sobre el nuevo subtotal e incluye el fixed pactado", () => {
    const priced = applyPromoToEventSubtotal({
      subtotal: 10000,
      discountType: "percentage",
      discountValue: 50,
      rate: 0.08,
      fixedFee: 200,
    })

    assert.equal(priced.subtotal, 5000)
    assert.equal(priced.serviceCharge, 600)
    assert.equal(priced.total, 5000)
  })

  it("tope el descuento fijo al subtotal y deja fee 0 si el subtotal queda en 0", () => {
    const priced = applyPromoToEventSubtotal({
      subtotal: 1500.5,
      discountType: "fixed_amount",
      discountValue: 9999,
      rate: 0.15,
    })

    assert.equal(priced.discount, 1500.5)
    assert.equal(priced.subtotal, 0)
    assert.equal(priced.serviceCharge, 0)
    assert.equal(priced.total, 0)
  })
})
