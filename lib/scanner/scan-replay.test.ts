import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  SCAN_REPLAY_HTTP_STATUS,
  isScanReplayCode,
  scanReplayHttpStatus,
} from "./scan-replay"

describe("QR replay conflict", () => {
  it("maps an already scanned ticket to HTTP 409", () => {
    assert.equal(isScanReplayCode("already_used"), true)
    assert.equal(isScanReplayCode("already_used_today"), true)
    assert.equal(isScanReplayCode("granted"), false)
    assert.equal(
      scanReplayHttpStatus({ success: false, status: "already_used" }),
      SCAN_REPLAY_HTTP_STATUS,
    )
    assert.equal(SCAN_REPLAY_HTTP_STATUS, 409)
  })

  it("keeps a first successful admission as 200", () => {
    assert.equal(
      scanReplayHttpStatus({ success: true, status: "granted" }),
      200,
    )
  })
})
