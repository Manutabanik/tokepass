import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  EVENT_CANCELLATION_ALREADY_REQUESTED_ERROR,
  EVENT_CANCELLATION_REASON_ERROR,
  EVENT_HAS_CONFIRMED_SALES_ERROR,
  EVENT_PUBLISHED_MUST_REQUEST_CANCEL_ERROR,
  canOrganizerRequestCancellation,
  canOrganizerSoftDeleteStatus,
  eventCancellationRequestDecision,
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

  it("does not soft-delete a published event", () => {
    const blocked = eventSoftDeleteDecision({
      status: "published",
      paidOrders: 0,
      confirmedTickets: 0,
    })
    assert.equal(blocked.ok, false)
    if (!blocked.ok) {
      assert.equal(blocked.error, EVENT_PUBLISHED_MUST_REQUEST_CANCEL_ERROR)
    }
    assert.equal(canOrganizerSoftDeleteStatus("draft"), true)
    assert.equal(canOrganizerSoftDeleteStatus("published"), false)
  })

  it("accepts a cancellation request only on live events with a reason", () => {
    assert.equal(canOrganizerRequestCancellation("published"), true)
    assert.equal(canOrganizerRequestCancellation("draft"), false)
    const ok = eventCancellationRequestDecision({
      status: "published",
      reason: "Lluvia extrema y corte municipal",
    })
    assert.deepEqual(ok, { ok: true })
    const short = eventCancellationRequestDecision({
      status: "published",
      reason: "corto",
    })
    assert.equal(short.ok, false)
    if (!short.ok) assert.equal(short.error, EVENT_CANCELLATION_REASON_ERROR)
    const already = eventCancellationRequestDecision({
      status: "cancellation_requested",
      reason: "Lluvia extrema y corte municipal",
    })
    assert.equal(already.ok, false)
    if (!already.ok) {
      assert.equal(already.error, EVENT_CANCELLATION_ALREADY_REQUESTED_ERROR)
    }
  })
})
