import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { serverUtcIso, serverUtcMs, serverUtcNow } from "./server-now"

describe("server UTC clock", () => {
  it("normalizes a fixed instant without reading the client", () => {
    const frozen = Date.UTC(2026, 7, 26, 12, 0, 0)
    assert.equal(serverUtcMs(frozen), frozen)
    assert.equal(serverUtcNow(frozen).toISOString(), "2026-08-26T12:00:00.000Z")
    assert.equal(serverUtcIso(new Date(frozen)), "2026-08-26T12:00:00.000Z")
  })
})
