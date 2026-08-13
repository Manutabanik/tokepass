import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  decodeLivingPayload,
  isLivingWindowAccepted,
  resolveScanSecret,
} from "./scan-payload"
import { generateLivingQrPayload, getTotpWindow } from "./totp-offline"

describe("Living QR time window", () => {
  it("accepts the current and adjacent 15-second windows", () => {
    const current = getTotpWindow(1_725_000_000_000)

    assert.equal(isLivingWindowAccepted(current, current), true)
    assert.equal(isLivingWindowAccepted(current - 1, current), true)
    assert.equal(isLivingWindowAccepted(current + 1, current), true)
  })

  it("rejects expired and future manipulated windows", () => {
    const current = getTotpWindow(1_725_000_000_000)

    assert.equal(isLivingWindowAccepted(current - 2, current), false)
    assert.equal(isLivingWindowAccepted(current + 2, current), false)
  })

  it("creates an opaque v2 payload without embedding the secret", async () => {
    const ticketId = "9dfcc6ca-8d97-4d9c-951d-ffabc21e6210"
    const secret = "server-issued-secret"
    const payload = await generateLivingQrPayload(
      ticketId,
      secret,
      1_725_000_000_000,
    )

    assert.equal(payload.includes(secret), false)
    assert.deepEqual(decodeLivingPayload(payload), {
      version: 2,
      ticketId,
      timestampBlock: getTotpWindow(1_725_000_000_000),
      mac: payload.split(".")[3],
    })
  })

  it("keeps fixed QR compatibility for explicitly static events", () => {
    assert.deepEqual(resolveScanSecret("legacy-static-secret", "static"), {
      mode: "secret",
      totpSecret: "legacy-static-secret",
      expired: false,
      enforceFreshness: false,
    })
  })

  it("accepts raw POS paper secrets even when the event is Living QR dynamic", () => {
    const posSecret = "a".repeat(48)
    assert.deepEqual(resolveScanSecret(posSecret, "dynamic"), {
      mode: "secret",
      totpSecret: posSecret,
      expired: false,
      enforceFreshness: false,
    })
  })
})
