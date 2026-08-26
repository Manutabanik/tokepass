import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { decideOrphanPaymentAction } from "./orphan-reconcile"

describe("orphan payment reconcile", () => {
  it("finalizes when Mercado Pago already approved the charge", () => {
    const decided = decideOrphanPaymentAction([
      { id: "1", status: "rejected", amount: 1000 },
      { id: "2", status: "approved", amount: 4500, currency: "ARS" },
    ])
    assert.equal(decided.action, "finalize")
    assert.equal(decided.payment?.id, "2")
  })

  it("keeps inventory when the gateway is still in flight or unknown", () => {
    assert.equal(
      decideOrphanPaymentAction([{ id: "1", status: "pending", amount: 10 }])
        .action,
      "keep",
    )
    assert.equal(decideOrphanPaymentAction([]).action, "keep")
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
