import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  resolveAuthCallbackDestination,
  safeInternalNextPath,
} from "@/lib/auth/next-path"

describe("auth next path", () => {
  it("rejects open redirects", () => {
    assert.equal(safeInternalNextPath("https://evil.test"), null)
    assert.equal(safeInternalNextPath("//evil.test"), null)
    assert.equal(safeInternalNextPath("/checkout"), "/checkout")
  })

  it("honors checkout next and falls back to home for buyers", () => {
    assert.equal(
      resolveAuthCallbackDestination("/event/abc/checkout", "customer"),
      "/event/abc/checkout",
    )
    assert.equal(resolveAuthCallbackDestination(null, "customer"), "/")
    assert.equal(resolveAuthCallbackDestination(null, "admin"), "/admin")
  })
})
