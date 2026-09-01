import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildAuthCallbackUrl,
  isAllowedAuthOrigin,
  resolveAuthRequestOrigin,
} from "./callback-url"

describe("auth callback url", () => {
  it("prefers the tab origin so local Google login does not bounce to production", () => {
    assert.equal(
      resolveAuthRequestOrigin({
        origin: "http://localhost:3000",
        siteUrl: "https://tokepass.com",
      }),
      "http://localhost:3000",
    )
    assert.equal(
      resolveAuthRequestOrigin({
        forwardedHost: "tokepass.com",
        forwardedProto: "https",
        siteUrl: "https://tokepass.com",
      }),
      "https://tokepass.com",
    )
  })

  it("rejects attacker origins", () => {
    assert.equal(isAllowedAuthOrigin("https://evil.test", "https://tokepass.com"), false)
    assert.equal(
      resolveAuthRequestOrigin({
        origin: "https://evil.test",
        siteUrl: "https://tokepass.com",
      }),
      "https://tokepass.com",
    )
  })

  it("keeps the Google redirectTo without next so it matches the allowlist", () => {
    assert.equal(
      buildAuthCallbackUrl("https://tokepass.com"),
      "https://tokepass.com/auth/callback",
    )
    assert.equal(
      buildAuthCallbackUrl("https://tokepass.com", "/cuenta"),
      "https://tokepass.com/auth/callback?next=%2Fcuenta",
    )
  })
})
