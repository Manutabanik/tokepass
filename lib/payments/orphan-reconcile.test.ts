import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { GA_CHECKOUT_HOLD_MS } from "@/lib/checkout-hold"
import { RECONCILE_CRITICAL_HOLD_MS } from "@/lib/checkout/expire-holds-policy"

import {
  decideOrphanPaymentAction,
  isCriticalOrphanHold,
  prioritizeOrphanReconcileOrders,
  shouldRefundOrphanFinalize,
} from "./orphan-reconcile"

describe("orphan payment reconcile", () => {
  it("finalizes when Mercado Pago already approved the charge", () => {
    const decided = decideOrphanPaymentAction([
      { id: "1", status: "rejected", amount: 1000 },
      { id: "2", status: "approved", amount: 4500, currency: "ARS" },
    ])
    assert.equal(decided.action, "finalize")
    assert.equal(decided.payment?.id, "2")
  })

  it("keeps inventory while the gateway payment is still in flight", () => {
    assert.equal(
      decideOrphanPaymentAction([{ id: "1", status: "pending", amount: 10 }])
        .action,
      "keep",
    )
  })

  it("releases a preference that never created a payment", () => {
    assert.equal(decideOrphanPaymentAction([]).action, "release")
  })

  it("releases only after the gateway rejected or cancelled the attempt", () => {
    assert.equal(
      decideOrphanPaymentAction([
        { id: "9", status: "cancelled", amount: 10 },
      ]).action,
      "release",
    )
  })
})

describe("shouldRefundOrphanFinalize", () => {
  it("refunds when finalize asks for it or the order already expired", () => {
    assert.equal(
      shouldRefundOrphanFinalize({
        ok: false,
        needsRefund: true,
        code: "seating_hold_expired",
      }),
      true,
    )
    assert.equal(
      shouldRefundOrphanFinalize({ ok: false, code: "order_expired" }),
      true,
    )
    assert.equal(
      shouldRefundOrphanFinalize({ ok: false, code: "finalize_failed" }),
      false,
    )
    assert.equal(shouldRefundOrphanFinalize({ ok: true, code: "paid" }), false)
  })
})

describe("prioritizeOrphanReconcileOrders", () => {
  const NOW = Date.parse("2026-09-01T12:00:00.000Z")

  it("checks critical holds in the last two minutes before older or younger carts", () => {
    const criticalStarted = new Date(
      NOW - (GA_CHECKOUT_HOLD_MS - 60_000),
    ).toISOString()
    const youngStarted = new Date(NOW - 60_000).toISOString()
    const expiredStarted = new Date(
      NOW - GA_CHECKOUT_HOLD_MS - 30_000,
    ).toISOString()

    assert.equal(isCriticalOrphanHold(criticalStarted, NOW), true)
    assert.equal(
      isCriticalOrphanHold(
        new Date(NOW - (GA_CHECKOUT_HOLD_MS - RECONCILE_CRITICAL_HOLD_MS - 1)).toISOString(),
        NOW,
      ),
      false,
    )

    const ordered = prioritizeOrphanReconcileOrders(
      [
        { id: "young", payment_started_at: youngStarted },
        { id: "expired", payment_started_at: expiredStarted },
        { id: "critical", payment_started_at: criticalStarted },
      ],
      NOW,
    ).map((order) => order.id)

    assert.deepEqual(ordered, ["critical", "expired", "young"])
  })
})
