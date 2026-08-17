import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isWaitingRoomBypassPath,
  resolveProtectedEventKey,
  safeQueueNextPath,
  waitingRoomUrl,
} from "./paths"

describe("waiting-room paths", () => {
  it("protects checkout aliases and the public storefront", () => {
    assert.equal(resolveProtectedEventKey("/event/fiesta/checkout"), "fiesta")
    assert.equal(resolveProtectedEventKey("/events/abc/checkout"), "abc")
    assert.equal(resolveProtectedEventKey("/eventos/fiesta/checkout"), "fiesta")
    assert.equal(resolveProtectedEventKey("/eventos/fiesta"), "fiesta")
    assert.equal(resolveProtectedEventKey("/checkout"), "__checkout__")
  })

  it("does not gate the virtual queue or status API", () => {
    assert.equal(isWaitingRoomBypassPath("/event/fiesta/queue"), true)
    assert.equal(isWaitingRoomBypassPath("/api/queue/status"), true)
    assert.equal(isWaitingRoomBypassPath("/api/queue-status"), true)
    assert.equal(isWaitingRoomBypassPath("/waiting-room"), true)
    assert.equal(resolveProtectedEventKey("/event/fiesta/queue"), null)
  })

  it("builds a per-event queue URL", () => {
    const url = waitingRoomUrl(
      { clone: () => new URL("http://localhost:3000/eventos/fiesta") },
      "fiesta",
      "/eventos/fiesta",
    )
    assert.equal(url.pathname, "/event/fiesta/queue")
    assert.equal(url.searchParams.get("next"), "/eventos/fiesta")
  })

  it("rejects open redirects on next", () => {
    assert.equal(safeQueueNextPath("https://evil.test", "fiesta"), "/eventos/fiesta")
    assert.equal(safeQueueNextPath("//evil.test", "fiesta"), "/eventos/fiesta")
    assert.equal(safeQueueNextPath("/eventos/fiesta", "fiesta"), "/eventos/fiesta")
  })
})
