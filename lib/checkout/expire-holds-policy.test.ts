import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { GA_CHECKOUT_HOLD_MS } from "@/lib/checkout-hold"

import {
  holdTtlCutoffIso,
  shouldExpireAbandonedOrder,
} from "./expire-holds-policy"

const NOW = Date.parse("2026-08-31T18:00:00.000Z")

describe("shouldExpireAbandonedOrder", () => {
  it("releases a cart that never started payment after 15 minutes", () => {
    assert.equal(
      shouldExpireAbandonedOrder(
        {
          status: "pending",
          createdAt: "2026-08-31T17:44:59.000Z",
        },
        NOW,
      ),
      true,
    )
    assert.equal(
      shouldExpireAbandonedOrder(
        {
          status: "pending",
          createdAt: "2026-08-31T17:45:01.000Z",
        },
        NOW,
      ),
      false,
    )
  })

  it("anchors payment-started holds to payment_started_at, not created_at", () => {
    assert.equal(
      shouldExpireAbandonedOrder(
        {
          status: "pending",
          createdAt: "2026-08-31T17:30:00.000Z",
          paymentStartedAt: "2026-08-31T17:50:00.000Z",
        },
        NOW,
      ),
      false,
    )
    assert.equal(
      shouldExpireAbandonedOrder(
        {
          status: "pending",
          createdAt: "2026-08-31T17:30:00.000Z",
          paymentStartedAt: "2026-08-31T17:44:00.000Z",
        },
        NOW,
      ),
      true,
    )
  })

  it("never expires a paid order", () => {
    assert.equal(
      shouldExpireAbandonedOrder(
        {
          status: "paid",
          createdAt: "2026-08-31T17:00:00.000Z",
        },
        NOW,
      ),
      false,
    )
  })

  it("cuts the TTL window 15 minutes behind now", () => {
    assert.equal(
      holdTtlCutoffIso(NOW),
      new Date(NOW - GA_CHECKOUT_HOLD_MS).toISOString(),
    )
  })
})
