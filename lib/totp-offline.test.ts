import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  generateLivingQrPayload,
  generateStaticQrPayload,
  LIVING_QR_GRACE_BLOCKS,
  LIVING_QR_MAX_LIFETIME_MS,
  LIVING_QR_PERIOD_MS,
  MISSING_TOTP_SECRET_ERROR,
  requireTotpSecret,
  signedDoorQrOrFallback,
  verifyLivingQrMac,
} from "./totp-offline"

describe("living QR window policy", () => {
  it("keeps a 15s period and at most ±1 grace block (30s max life)", () => {
    assert.equal(LIVING_QR_PERIOD_MS, 15_000)
    assert.equal(LIVING_QR_GRACE_BLOCKS, 1)
    assert.equal(LIVING_QR_MAX_LIFETIME_MS, 30_000)
    assert.ok(LIVING_QR_MAX_LIFETIME_MS <= 30_000)
  })
})

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
