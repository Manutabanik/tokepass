import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  loginUrlWithNext,
  organizerLoginUrlWithNext,
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

  it("sends the email wallet deep link through login without losing next", () => {
    assert.equal(
      loginUrlWithNext("/cuenta/entradas"),
      "/login?next=%2Fcuenta%2Fentradas",
    )
    assert.equal(
      resolveAuthCallbackDestination("/cuenta/entradas", "customer"),
      "/cuenta/entradas",
    )
  })

  it("keeps the organizer intent, query string included", () => {
    assert.equal(
      organizerLoginUrlWithNext("/dashboard/settings/bank"),
      "/login-organizador?next=%2Fdashboard%2Fsettings%2Fbank",
    )
    assert.equal(
      organizerLoginUrlWithNext("/admin/events/abc/tiers?tab=mesas"),
      "/login-organizador?next=%2Fadmin%2Fevents%2Fabc%2Ftiers%3Ftab%3Dmesas",
    )
  })

  it("falls back to the organizer panel instead of leaking an external next", () => {
    assert.equal(
      organizerLoginUrlWithNext("https://evil.test/admin"),
      "/login-organizador?next=%2Fadmin",
    )
    assert.equal(
      organizerLoginUrlWithNext("//evil.test"),
      "/login-organizador?next=%2Fadmin",
    )
  })
})
