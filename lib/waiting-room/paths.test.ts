import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isNextServerActionRequest,
  isOrganizerEventPreviewPath,
  isWaitingRoomBypassPath,
  resolveProtectedEventKey,
  resolveRefererEventKey,
  resolveRequestEventKey,
  safeQueueNextPath,
  waitingRoomUrl,
} from "./paths"

describe("waiting-room paths", () => {
  it("protects checkout aliases and the public storefront", () => {
    assert.equal(resolveProtectedEventKey("/event/fiesta/checkout"), "fiesta")
    assert.equal(resolveProtectedEventKey("/events/abc/checkout"), "abc")
    assert.equal(resolveProtectedEventKey("/eventos/fiesta/checkout"), "fiesta")
    assert.equal(resolveProtectedEventKey("/eventos/fiesta"), "fiesta")
    assert.equal(resolveProtectedEventKey("/e/fiesta"), "fiesta")
    assert.equal(resolveProtectedEventKey("/checkout"), "__checkout__")
  })

  it("does not gate organizer draft preview", () => {
    assert.equal(isOrganizerEventPreviewPath("/events/preview/abc"), true)
    assert.equal(resolveProtectedEventKey("/events/preview/abc"), null)
    assert.equal(resolveProtectedEventKey("/events/preview"), null)
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

  it("gates server actions via same-origin referer", () => {
    assert.equal(
      isNextServerActionRequest({
        method: "POST",
        headers: { get: (name) => (name === "next-action" ? "abc" : null) },
      }),
      true,
    )
    assert.equal(
      resolveRefererEventKey("https://tokepass.test/e/fiesta", "https://tokepass.test"),
      "fiesta",
    )
    assert.equal(
      resolveRefererEventKey("https://evil.test/e/fiesta", "https://tokepass.test"),
      null,
    )
    assert.equal(
      resolveRequestEventKey({
        method: "POST",
        headers: {
          get: (name) => {
            if (name === "next-action") return "abc"
            if (name === "referer") return "https://tokepass.test/e/fiesta"
            return null
          },
        },
        nextUrl: { pathname: "/", origin: "https://tokepass.test" },
      }),
      "fiesta",
    )
  })
})
