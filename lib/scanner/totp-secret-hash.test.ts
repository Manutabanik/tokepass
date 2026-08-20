import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { hashTotpSecretSha256 } from "./totp-secret-hash"

describe("totp secret snapshot hash", () => {
  it("hashes the same secret to the same hex", async () => {
    const first = await hashTotpSecretSha256("secret-one")
    const second = await hashTotpSecretSha256("secret-one")
    assert.equal(first.length, 64)
    assert.equal(first, second)
  })

  it("changes when the secret rotates", async () => {
    const before = await hashTotpSecretSha256("old-secret")
    const after = await hashTotpSecretSha256("new-secret")
    assert.notEqual(before, after)
  })

  it("returns empty for a blank secret", async () => {
    assert.equal(await hashTotpSecretSha256("   "), "")
  })
})
