import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { readJwtAal } from "@/lib/auth/jwt-aal"

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url",
  )
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${header}.${body}.sig`
}

describe("readJwtAal", () => {
  it("lee aal2 del access token", () => {
    assert.equal(readJwtAal(fakeJwt({ aal: "aal2", sub: "user-1" })), "aal2")
  })

  it("lee aal1 y rechaza tokens invalidos", () => {
    assert.equal(readJwtAal(fakeJwt({ aal: "aal1" })), "aal1")
    assert.equal(readJwtAal("not-a-jwt"), null)
    assert.equal(readJwtAal(null), null)
    assert.equal(readJwtAal(fakeJwt({ aal: "aal3" })), null)
  })
})
