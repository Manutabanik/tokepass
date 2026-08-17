import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  decryptTotpSecret,
  encryptTotpSecret,
  lockScannerVault,
  serializeEncryptedSecret,
  totpSecretLookupHash,
  unlockOrCreateScannerVault,
} from "@/lib/scanner/manifest-crypto"

describe("scanner manifest crypto", () => {
  it("roundtrips a totp_secret and never persists plaintext", async () => {
    const pin = "4820"
    const secret = "living-qr-seed-do-not-store-plain"
    const created = await unlockOrCreateScannerVault(pin, null)
    assert.equal(created.created, true)

    const blob = await encryptTotpSecret(secret)
    const packed = serializeEncryptedSecret(blob)
    assert.equal(packed.includes(secret), false)
    assert.equal(blob.ct.includes(secret), false)

    const unlocked = await unlockOrCreateScannerVault(pin, created.record)
    assert.equal(unlocked.created, false)
    assert.equal(await decryptTotpSecret(blob), secret)

    const lookup = await totpSecretLookupHash(secret)
    assert.equal(lookup.length, 64)
    assert.equal(lookup.includes(secret), false)

    lockScannerVault()
  })

  it("rejects a wrong validator PIN", async () => {
    const created = await unlockOrCreateScannerVault("1111", null)
    lockScannerVault()
    await assert.rejects(
      () => unlockOrCreateScannerVault("9999", created.record),
      /PIN de validador incorrecto/,
    )
  })
})
