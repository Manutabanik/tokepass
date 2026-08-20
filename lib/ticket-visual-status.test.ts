import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveTicketVisualStatus } from "./ticket-visual-status"

describe("resolveTicketVisualStatus", () => {
  it("is active when the ticket is free of pending moves", () => {
    assert.equal(
      resolveTicketVisualStatus({
        pendingTransfer: null,
        activeResaleListingId: null,
      }),
      "active",
    )
  })

  it("prefers transfer_pending over resale", () => {
    assert.equal(
      resolveTicketVisualStatus({
        pendingTransfer: { id: "tr_1" },
        activeResaleListingId: "listing_1",
      }),
      "transfer_pending",
    )
  })

  it("marks an active marketplace listing as resale_pending", () => {
    assert.equal(
      resolveTicketVisualStatus({
        pendingTransfer: null,
        activeResaleListingId: "listing_1",
      }),
      "resale_pending",
    )
  })
})
