import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  eventAcceptsMercadoPago,
  eventAcceptsPosPayments,
} from "@/lib/events/checkout-policy"
import {
  REFUND_POLICY_OPTIONS,
  refundPolicyBuyerCopy,
} from "@/lib/events/refund-policy"
import {
  listCheckoutPaymentOptions,
  resolveCheckoutPaymentProvider,
} from "@/components/public/payment-method-selector"

describe("refund and checkout policy", () => {
  it("uses organizer copy by default and honors explicit policies", () => {
    assert.match(refundPolicyBuyerCopy(undefined), /caso por caso/)
    assert.match(refundPolicyBuyerCopy("no_refunds"), /no admite devoluciones/)
    assert.match(refundPolicyBuyerCopy("until_24h"), /24 horas/)
  })

  it("hides Mercado Pago when the event disabled it", () => {
    const all = listCheckoutPaymentOptions(true)
    const withoutMp = listCheckoutPaymentOptions(false)
    assert.equal(
      all.some((option) => option.value === "mercadopago"),
      true,
    )
    assert.equal(
      withoutMp.some((option) => option.value === "mercadopago"),
      false,
    )
    assert.ok(withoutMp.length >= 1)
    assert.equal(
      resolveCheckoutPaymentProvider("mercadopago", false),
      "payway",
    )
    assert.equal(
      resolveCheckoutPaymentProvider("naranjax", false),
      "naranjax",
    )
  })

  it("treats only explicit false as a disabled checkout medium", () => {
    assert.equal(eventAcceptsMercadoPago(undefined), true)
    assert.equal(eventAcceptsMercadoPago(null), true)
    assert.equal(eventAcceptsMercadoPago(false), false)
    assert.equal(eventAcceptsPosPayments(false), false)
    assert.equal(
      REFUND_POLICY_OPTIONS.map((option) => option.value).join(","),
      "organizer,no_refunds,until_24h",
    )
  })
})
