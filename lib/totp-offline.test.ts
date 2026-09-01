import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  generateLivingQrPayload,
  generateStaticQrPayload,
  MISSING_TOTP_SECRET_ERROR,
  requireTotpSecret,
  signedDoorQrOrFallback,
  verifyLivingQrMac,
} from "./totp-offline"

describe("strict totp secret", () => {
  it("refuses to sign or fall back to ticketId", async () => {
    assert.throws(() => requireTotpSecret(""), /Missing TOTP Secret/)
    assert.throws(() => requireTotpSecret("   "), /Missing TOTP Secret/)
    await assert.rejects(
      generateLivingQrPayload("ticket-id", ""),
      (error: unknown) =>
        error instanceof Error && error.message === MISSING_TOTP_SECRET_ERROR,
    )
    await assert.rejects(
      generateStaticQrPayload("ticket-id", ""),
      (error: unknown) =>
        error instanceof Error && error.message === MISSING_TOTP_SECRET_ERROR,
    )
    assert.equal(signedDoorQrOrFallback("ticket-id", ""), "")
    assert.equal(await verifyLivingQrMac("", "ticket-id", 1, "abcd"), false)
  })
})
