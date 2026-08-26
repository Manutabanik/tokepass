import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  EVENT_HAS_CONFIRMED_SALES_ERROR,
  eventSoftDeleteDecision,
  isConfirmedSaleTicketStatus,
} from "./event-delete-policy"

describe("event soft delete policy", () => {
  it("soft-deletes drafts without confirmed sales", () => {
    const decision = eventSoftDeleteDecision({
      paidOrders: 0,
      confirmedTickets: 0,
    })
    assert.deepEqual(decision, { ok: true, mode: "deleted" })
  })

  it("blocks confirmed paid sales and valid tickets", () => {
    assert.equal(
      eventSoftDeleteDecision({ paidOrders: 1, confirmedTickets: 0 }).ok,
      false,
    )
    const blocked = eventSoftDeleteDecision({
      paidOrders: 0,
      confirmedTickets: 2,
    })
    assert.equal(blocked.ok, false)
    if (!blocked.ok) assert.equal(blocked.error, EVENT_HAS_CONFIRMED_SALES_ERROR)
    assert.equal(isConfirmedSaleTicketStatus("valid"), true)
    assert.equal(isConfirmedSaleTicketStatus("pending_payment"), false)
  })
})
