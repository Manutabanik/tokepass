import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatHoldCountdown,
  GA_CHECKOUT_HOLD_MS,
  resolveOrderHoldExpiresAt,
} from "./checkout-hold"

describe("hold countdown", () => {
  it("formats MM:SS with padded digits", () => {
    assert.equal(formatHoldCountdown(900), "15:00")
    assert.equal(formatHoldCountdown(600), "10:00")
    assert.equal(formatHoldCountdown(61), "01:01")
    assert.equal(formatHoldCountdown(0), "00:00")
  })

  it("never goes below zero", () => {
    assert.equal(formatHoldCountdown(-12), "00:00")
  })
})

describe("resolveOrderHoldExpiresAt", () => {
  it("anchors the GA hold to order created_at, not now", () => {
    const created = "2026-08-21T15:00:00.000Z"
    const expires = resolveOrderHoldExpiresAt(created)
    assert.equal(
      expires.getTime(),
      new Date(created).getTime() + GA_CHECKOUT_HOLD_MS,
    )
  })

  it("uses the earlier seating reserved_until when it is shorter", () => {
    const created = "2026-08-21T15:00:00.000Z"
    const reserved = "2026-08-21T15:05:00.000Z"
    const expires = resolveOrderHoldExpiresAt(created, reserved)
    assert.equal(expires.toISOString(), reserved)
  })
})
