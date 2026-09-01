import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isSupervisorOfflineSyncAlert,
  isTerminalOfflineSyncConflict,
  overlayKindFromDeniedScanStatus,
  resolveOfflineSyncAdmission,
} from "@/lib/scanner/offline-sync-conflicts"

describe("offline sync terminal conflicts", () => {
  it("evicts definitive status errors and keeps transient ones", () => {
    assert.equal(isTerminalOfflineSyncConflict("unpaid"), true)
    assert.equal(isTerminalOfflineSyncConflict("invalid_status"), true)
    assert.equal(isTerminalOfflineSyncConflict("cancelled"), true)
    assert.equal(isTerminalOfflineSyncConflict("refunded"), true)
    assert.equal(isTerminalOfflineSyncConflict("Forbidden"), false)
    assert.equal(isTerminalOfflineSyncConflict("already_used"), true)
    assert.equal(isTerminalOfflineSyncConflict("already_used_today"), true)
  })

  it("treats already_used as a supervisor alert and drops it from retries", () => {
    assert.deepEqual(resolveOfflineSyncAdmission(0, "already_used"), {
      kind: "evict_conflict",
      reason: "already_used",
    })
    assert.deepEqual(resolveOfflineSyncAdmission(0, "already_used_today"), {
      kind: "evict_conflict",
      reason: "already_used_today",
    })
    assert.deepEqual(resolveOfflineSyncAdmission(1, "already_used"), {
      kind: "synced",
    })
    assert.deepEqual(resolveOfflineSyncAdmission(0, "Forbidden"), {
      kind: "retry",
      reason: "Forbidden",
    })
    assert.deepEqual(resolveOfflineSyncAdmission(0, "cancelled"), {
      kind: "evict",
    })
    assert.equal(isSupervisorOfflineSyncAlert("already_used"), true)
    assert.equal(isSupervisorOfflineSyncAlert("unpaid"), false)
  })
})

describe("denied scan overlay mapping", () => {
  it("maps known denials to dedicated overlays", () => {
    assert.equal(overlayKindFromDeniedScanStatus("cancelled"), "cancelled")
    assert.equal(overlayKindFromDeniedScanStatus("refunded"), "cancelled")
    assert.equal(overlayKindFromDeniedScanStatus("unpaid"), "unpaid")
    assert.equal(overlayKindFromDeniedScanStatus("transferred"), "transferred")
    assert.equal(overlayKindFromDeniedScanStatus("expired_qr"), "expired_qr")
    assert.equal(overlayKindFromDeniedScanStatus("listed_for_resale"), "listed_for_resale")
    assert.equal(overlayKindFromDeniedScanStatus("wrong_event"), "invalid")
    assert.equal(overlayKindFromDeniedScanStatus("already_used"), "duplicate")
    assert.equal(
      overlayKindFromDeniedScanStatus("already_used_today"),
      "duplicate",
    )
  })
})
