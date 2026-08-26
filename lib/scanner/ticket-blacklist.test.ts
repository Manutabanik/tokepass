import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isDeniedAdmissionTicketStatus,
  isScannerBlacklistTicketStatus,
  parseScannerBlacklistPayload,
} from "@/lib/scanner/ticket-blacklist"

describe("scanner ticket blacklist", () => {
  it("flags refunded, cancelled and revoked tickets", () => {
    assert.equal(isScannerBlacklistTicketStatus("refunded"), true)
    assert.equal(isScannerBlacklistTicketStatus("cancelled"), true)
    assert.equal(isScannerBlacklistTicketStatus("revoked"), true)
    assert.equal(isScannerBlacklistTicketStatus("valid"), false)
  })

  it("parses a flat ticket_id array and de-duplicates", () => {
    assert.deepEqual(
      parseScannerBlacklistPayload([" a ", "a", "b", 1, ""]),
      ["a", "b"],
    )
    assert.deepEqual(
      parseScannerBlacklistPayload({ ticket_ids: ["t1", "t1", "t2"] }),
      ["t1", "t2"],
    )
    assert.deepEqual(parseScannerBlacklistPayload({}), [])
  })

  it("denies unpaid and transferred tickets at the door", () => {
    assert.equal(isDeniedAdmissionTicketStatus("pending_payment"), true)
    assert.equal(isDeniedAdmissionTicketStatus("transferred"), true)
    assert.equal(isDeniedAdmissionTicketStatus("refunded"), true)
    assert.equal(isDeniedAdmissionTicketStatus("valid"), false)
  })
})
