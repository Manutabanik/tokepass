import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  DEFAULT_ORGANIZER_SERVICE_CHARGE_RATE,
  DEFAULT_PLATFORM_FEE_PERCENTAGE,
  organizerRateToFeePercentage,
  resolvePublicEventFeeRule,
} from "./event-fees"

describe("platform fee defaults", () => {
  it("defaults new organizers and events to 15 percent", () => {
    assert.equal(DEFAULT_ORGANIZER_SERVICE_CHARGE_RATE, 0.15)
    assert.equal(DEFAULT_PLATFORM_FEE_PERCENTAGE, 15)
    assert.equal(organizerRateToFeePercentage(0.15), 15)
    assert.equal(organizerRateToFeePercentage(null), 15)
    assert.equal(organizerRateToFeePercentage(0), 0)
    assert.equal(organizerRateToFeePercentage(0.125), 12.5)
  })
})

describe("resolvePublicEventFeeRule", () => {
  it("uses the event column as points and keeps a positive RPC fraction", () => {
    assert.deepEqual(
      resolvePublicEventFeeRule({
        platformFeePercentage: 8,
        rpcRate: 0.08,
        platformFixedFee: 200,
        rpcFixedFee: 200,
      }),
      { rate: 0.08, fixedFee: 200 },
    )
  })

  it("does not let an RPC zero wipe a live event rate", () => {
    assert.equal(
      resolvePublicEventFeeRule({
        platformFeePercentage: 10,
        rpcRate: 0,
        platformFixedFee: 0,
      }).rate,
      0.1,
    )
  })

  it("falls back to the platform default when the event has no rate", () => {
    assert.equal(
      resolvePublicEventFeeRule({
        platformFeePercentage: 0,
        rpcRate: null,
      }).rate,
      DEFAULT_PLATFORM_FEE_PERCENTAGE / 100,
    )
  })

  it("zeros both fees on a sponsored event", () => {
    assert.deepEqual(
      resolvePublicEventFeeRule({
        platformFeePercentage: 8,
        rpcRate: 0.08,
        platformFixedFee: 200,
        isSponsored: true,
      }),
      { rate: 0, fixedFee: 0 },
    )
  })
})
