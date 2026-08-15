import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MemoryRateLimiter } from "@/lib/checkout/memory-rate-limit"

describe("in-memory checkout IP limiter", () => {
  it("allows bursts under the limit and blocks the next hit in the window", () => {
    const limiter = new MemoryRateLimiter(3, 1_000)
    assert.equal(limiter.consume("1.1.1.1", 0), true)
    assert.equal(limiter.consume("1.1.1.1", 10), true)
    assert.equal(limiter.consume("1.1.1.1", 20), true)
    assert.equal(limiter.consume("1.1.1.1", 30), false)
    assert.equal(limiter.consume("2.2.2.2", 30), true)
  })

  it("expires hits after the window", () => {
    const limiter = new MemoryRateLimiter(1, 100)
    assert.equal(limiter.consume("10.0.0.1", 0), true)
    assert.equal(limiter.consume("10.0.0.1", 99), false)
    assert.equal(limiter.consume("10.0.0.1", 100), true)
  })
})
