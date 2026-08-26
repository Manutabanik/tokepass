import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  evaluateTransferPolicy,
  isTransferWindowClosed,
  TRANSFER_ONCE_LIMIT_ERROR,
  TRANSFER_WINDOW_CLOSED_ERROR,
} from "./transfer-policy"

describe("transfer-policy", () => {
  it("blocks a ticket that was already transferred once", () => {
    const blocked = evaluateTransferPolicy({
      transferCount: 1,
      maxTransfersAllowed: 3,
      eventStartsAt: "2099-01-01T20:00:00.000Z",
    })
    assert.equal(blocked.ok, false)
    if (!blocked.ok) {
      assert.equal(blocked.code, "transfer_limit")
      assert.equal(blocked.error, TRANSFER_ONCE_LIMIT_ERROR)
    }
  })

  it("blocks transfers inside the 24h window", () => {
    const start = new Date("2026-08-27T20:00:00.000Z")
    const now = new Date("2026-08-26T21:00:00.000Z")
    assert.equal(isTransferWindowClosed(start, now), true)
    const blocked = evaluateTransferPolicy({
      transferCount: 0,
      eventStartsAt: start,
      now,
    })
    assert.equal(blocked.ok, false)
    if (!blocked.ok) {
      assert.equal(blocked.code, "window_closed")
      assert.equal(blocked.error, TRANSFER_WINDOW_CLOSED_ERROR)
    }
  })

  it("allows a first transfer more than 24h before the jornada", () => {
    const allowed = evaluateTransferPolicy({
      transferCount: 0,
      maxTransfersAllowed: 1,
      eventStartsAt: "2026-08-28T20:00:00.000Z",
      now: new Date("2026-08-26T12:00:00.000Z"),
    })
    assert.deepEqual(allowed, { ok: true })
  })
})
