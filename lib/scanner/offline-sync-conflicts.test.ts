import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isTerminalOfflineSyncConflict,
  overlayKindFromDeniedScanStatus,
} from "@/lib/scanner/offline-sync-conflicts"

describe("offline sync terminal conflicts", () => {
  it("evicts definitive status errors and keeps transient ones", () => {
    assert.equal(isTerminalOfflineSyncConflict("unpaid"), true)
    assert.equal(isTerminalOfflineSyncConflict("invalid_status"), true)
    assert.equal(isTerminalOfflineSyncConflict("cancelled"), true)
    assert.equal(isTerminalOfflineSyncConflict("Forbidden"), false)
    assert.equal(isTerminalOfflineSyncConflict("already_used"), false)
  })
})

describe("denied scan overlay mapping", () => {
  it("maps known denials to dedicated overlays", () => {
    assert.equal(overlayKindFromDeniedScanStatus("cancelled"), "cancelled")
    assert.equal(overlayKindFromDeniedScanStatus("unpaid"), "unpaid")
    assert.equal(overlayKindFromDeniedScanStatus("transferred"), "transferred")
    assert.equal(overlayKindFromDeniedScanStatus("expired_qr"), "expired_qr")
    assert.equal(overlayKindFromDeniedScanStatus("wrong_event"), "invalid")
  })
})
