import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { AUTH_NEXT_COOKIE } from "./callback-url"
import {
  isSupabaseAuthCookieName,
  shouldPurgeAuthSessionOnLoginError,
} from "./session-cookies"

describe("isSupabaseAuthCookieName", () => {
  it("matches chunked Supabase auth cookies and the next-path cookie", () => {
    assert.equal(
      isSupabaseAuthCookieName("sb-xxxx-auth-token"),
      true,
    )
    assert.equal(
      isSupabaseAuthCookieName("sb-xxxx-auth-token.0"),
      true,
    )
    assert.equal(
      isSupabaseAuthCookieName("sb-xxxx-auth-token-code-verifier"),
      true,
    )
    assert.equal(isSupabaseAuthCookieName(AUTH_NEXT_COOKIE), true)
    assert.equal(isSupabaseAuthCookieName("tokepass.wallet.device_id"), false)
  })
})

describe("shouldPurgeAuthSessionOnLoginError", () => {
  it("purges when the login URL carries an error", () => {
    assert.equal(
      shouldPurgeAuthSessionOnLoginError("Sesión iniciada en otro dispositivo"),
      true,
    )
    assert.equal(shouldPurgeAuthSessionOnLoginError(""), false)
    assert.equal(shouldPurgeAuthSessionOnLoginError(null), false)
  })
})
