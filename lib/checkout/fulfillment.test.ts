import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CHECKOUT_FULFILLMENT_HOLD_BUFFER_MS,
  mapOrderStatusToFulfillment,
  nextFulfillmentPollDelay,
} from "./fulfillment"

describe("checkout fulfillment polling", () => {
  it("maps paid and pending order statuses", () => {
    assert.equal(mapOrderStatusToFulfillment("paid"), "paid")
    assert.equal(mapOrderStatusToFulfillment("pending"), "pending")
    assert.equal(mapOrderStatusToFulfillment("expired"), "expired")
    assert.equal(mapOrderStatusToFulfillment("failed"), "failed")
    assert.equal(mapOrderStatusToFulfillment("unknown"), "not_found")
  })

  it("backs off after 30s and 2 minutes", () => {
    assert.equal(nextFulfillmentPollDelay(0), 2000)
    assert.equal(nextFulfillmentPollDelay(29_000), 2000)
    assert.equal(nextFulfillmentPollDelay(30_000), 4000)
    assert.equal(nextFulfillmentPollDelay(120_000), 8000)
  })

  it("keeps polling until holdExpiresAt plus the safety buffer", () => {
    const holdExpiresAt = "2026-08-17T18:10:00.000Z"
    const holdMs = Date.parse(holdExpiresAt)
    const startedAt = holdMs - 8 * 60 * 1000
    const stillOpen = holdMs + CHECKOUT_FULFILLMENT_HOLD_BUFFER_MS - 1
    const closed = holdMs + CHECKOUT_FULFILLMENT_HOLD_BUFFER_MS

    assert.equal(
      nextFulfillmentPollDelay(stillOpen - startedAt, {
        holdExpiresAt,
        nowMs: stillOpen,
      }),
      8000,
    )
    assert.equal(
      nextFulfillmentPollDelay(closed - startedAt, {
        holdExpiresAt,
        nowMs: closed,
      }),
      null,
    )
  })
})
