import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  STORE_QR_ROTATION_MS,
  decodeLivingStorePayload,
  encodeLivingStorePayload,
  storeTimestampBlock,
} from "./living-store-payload"

describe("living store payload", () => {
  it("encodes token-timestampBlock as base64 the bar scanner can decode", () => {
    const now = STORE_QR_ROTATION_MS * 42
    const payload = encodeLivingStorePayload("bar_abc123", now)
    assert.notEqual(payload.startsWith("TP2."), true)
    assert.equal(payload.includes("bar_"), false)
    assert.deepEqual(decodeLivingStorePayload(payload), {
      token: "bar_abc123",
      timestampBlock: 42,
    })
    assert.equal(
      Buffer.from(payload, "base64").toString("utf8"),
      "bar_abc123-42",
    )
  })

  it("accepts a raw bar_ token for staff fallback", () => {
    const decoded = decodeLivingStorePayload("bar_live_token")
    assert.equal(decoded?.token, "bar_live_token")
    assert.equal(decoded?.timestampBlock, storeTimestampBlock())
  })

  it("rejects door HMAC payloads", () => {
    assert.equal(decodeLivingStorePayload("TP2.ticket-id.12.deadbeef"), null)
    assert.equal(decodeLivingStorePayload("TPS.ticket-id.deadbeef"), null)
    assert.equal(
      decodeLivingStorePayload(
        Buffer.from("TP2.ticket-id.12.mac-9", "utf8").toString("base64"),
      ),
      null,
    )
  })
})
