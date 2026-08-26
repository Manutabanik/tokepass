import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  REALTIME_POLL_FALLBACK_MS,
  isRealtimeChannelDegraded,
} from "./channel-fallback"

describe("realtime channel fallback", () => {
  it("polls every 12 seconds when the socket is saturated or times out", () => {
    assert.equal(REALTIME_POLL_FALLBACK_MS, 12_000)
    assert.equal(isRealtimeChannelDegraded("CHANNEL_ERROR"), true)
    assert.equal(isRealtimeChannelDegraded("TIMED_OUT"), true)
    assert.equal(isRealtimeChannelDegraded("SUBSCRIBED"), false)
    assert.equal(isRealtimeChannelDegraded("CLOSED"), false)
  })
})
