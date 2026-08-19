import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { mapClaimTransferError } from "@/lib/transfer/claim-errors"

describe("mapClaimTransferError", () => {
  it("maps EMAIL_MISMATCH", () => {
    const result = mapClaimTransferError("EMAIL_MISMATCH")
    assert.equal(result.code, "email_mismatch")
    assert.match(result.error, /otro email/i)
  })

  it("maps TICKET_NOT_TRANSFERABLE instead of a blind generic", () => {
    const result = mapClaimTransferError(
      "TICKET_NOT_TRANSFERABLE",
    )
    assert.equal(result.code, "not_transferable")
    assert.doesNotMatch(result.error, /Probá de nuevo/)
  })

  it("maps TRANSFER_NOT_PENDING", () => {
    const result = mapClaimTransferError("TRANSFER_NOT_PENDING")
    assert.equal(result.code, "not_pending")
  })

  it("surfaces unknown PostgREST detail instead of swallowing it", () => {
    const result = mapClaimTransferError("permission denied for table tickets")
    assert.equal(result.code, "unknown")
    assert.match(result.error, /permission denied/i)
  })
})
