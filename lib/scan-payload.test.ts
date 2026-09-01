import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  decodeLivingPayload,
  isLivingWindowAccepted,
  isRetiredTransferSecret,
  resolveScanSecret,
} from "./scan-payload"
import {
  deviceClockOffsetMs,
  generateLivingQrPayload,
  generateStaticQrPayload,
  getTotpRemainingSeconds,
  getTotpWindow,
  serverAlignedNowMs,
  verifyLivingQrMac,
} from "./totp-offline"

describe("Living QR time window", () => {
  it("accepts current window plus three grace blocks (±45s)", () => {
    const current = getTotpWindow(1_725_000_000_000)

    assert.equal(isLivingWindowAccepted(current, current), true)
    assert.equal(isLivingWindowAccepted(current - 1, current), true)
    assert.equal(isLivingWindowAccepted(current + 3, current), true)
    assert.equal(isLivingWindowAccepted(current - 3, current), true)
  })

  it("rejects windows beyond the ±45s grace", () => {
    const current = getTotpWindow(1_725_000_000_000)

    assert.equal(isLivingWindowAccepted(current - 4, current), false)
    assert.equal(isLivingWindowAccepted(current + 4, current), false)
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

  it("rejects deprecated Living QR v1 payloads that embed the totp secret", () => {
    const secret = "legacy-replay-secret"
    const windowIndex = getTotpWindow(1_725_000_000_000)
    const v1 = Buffer.from(`${secret}-${windowIndex}`).toString("base64")
    assert.equal(resolveScanSecret(v1, "dynamic"), null)
    assert.equal(resolveScanSecret(v1, "static"), null)
    assert.deepEqual(decodeLivingPayload(v1), {
      version: 1,
      totpSecret: secret,
      timestampBlock: windowIndex,
    })
  })

  it("signs static paper/wallet QRs without embedding the totp secret", async () => {
    const ticketId = "9dfcc6ca-8d97-4d9c-951d-ffabc21e6210"
    const secret = "a".repeat(48)
    const payload = await generateStaticQrPayload(ticketId, secret)
    assert.equal(payload.includes(secret), false)
    assert.equal(payload.startsWith("TPS."), true)
    assert.deepEqual(resolveScanSecret(payload, "dynamic"), {
      mode: "tps",
      ticketId,
      mac: payload.split(".")[2],
      expired: false,
      enforceFreshness: false,
    })
  })

  it("rejects TPS payloads for online tickets on Living QR events", async () => {
    const ticketId = "9dfcc6ca-8d97-4d9c-951d-ffabc21e6210"
    const payload = await generateStaticQrPayload(ticketId, "a".repeat(48))
    assert.equal(
      resolveScanSecret(payload, "dynamic", { issuanceChannel: "online" }),
      null,
    )
    assert.equal(
      resolveScanSecret(payload, "dynamic", { issuanceChannel: null }),
      null,
    )
    const pos = resolveScanSecret(payload, "dynamic", { issuanceChannel: "pos" })
    assert.equal(pos?.mode, "tps")
    assert.equal(
      resolveScanSecret(payload, "static", { issuanceChannel: "online" })?.mode,
      "tps",
    )
  })

  it("accepts legacy 16-hex Living MACs and current 32-hex MACs", async () => {
    const ticketId = "9dfcc6ca-8d97-4d9c-951d-ffabc21e6210"
    const secret = "server-issued-secret"
    const now = 1_725_000_000_000
    const windowIndex = getTotpWindow(now)
    const payload = await generateLivingQrPayload(ticketId, secret, now)
    const mac32 = payload.split(".")[3]
    assert.equal(mac32.length, 32)
    assert.equal(await verifyLivingQrMac(secret, ticketId, windowIndex, mac32), true)
    assert.equal(
      await verifyLivingQrMac(secret, ticketId, windowIndex, mac32.slice(0, 16)),
      true,
    )
    assert.equal(await verifyLivingQrMac(secret, ticketId, windowIndex, "ab"), false)
  })

  it("counts remaining seconds inside the 15-second Living QR window", () => {
    assert.equal(getTotpRemainingSeconds(1_725_000_000_000), 15)
    assert.equal(getTotpRemainingSeconds(1_725_000_000_000 + 14_250), 1)
  })

  it("aligns device now using the stored clock offset", () => {
    const serverTs = 1_725_000_000_000
    const deviceTs = serverTs + 30_000
    const offset = deviceClockOffsetMs(serverTs, deviceTs)
    assert.equal(offset, deviceTs - serverTs)
    assert.equal(serverAlignedNowMs(offset, deviceTs), serverTs)
  })

  it("rejects secrets left on a decoupled transferred ticket", () => {
    assert.equal(isRetiredTransferSecret("xfer_dead_abc"), true)
    assert.equal(isRetiredTransferSecret("live-secret"), false)
    assert.equal(resolveScanSecret("xfer_dead_abc", "dynamic"), null)
  })
})
