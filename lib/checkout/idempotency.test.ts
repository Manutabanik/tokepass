import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CHECKOUT_IDEMPOTENCY_IN_PROGRESS_MS,
  checkoutCartFingerprint,
  checkoutTicketRowsFingerprint,
  isCheckoutIdempotencyInProgress,
  isReusableCheckoutOrderStatus,
} from "./idempotency"
import type { CheckoutCartItem } from "@/lib/validations/checkout"

const general = {
  type: "general",
  ticket_tier_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ticketTierId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  tierId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  quantity: 3,
} as CheckoutCartItem

const mappedA = {
  type: "mapped",
  ticket_tier_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  ticketTierId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  tierId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  quantity: 1,
  seatingUnitId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
} as CheckoutCartItem

const mappedB = {
  type: "mapped",
  ticket_tier_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  ticketTierId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  tierId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  quantity: 1,
  seatingUnitId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
} as CheckoutCartItem

describe("checkout idempotency fingerprints", () => {
  it("matches reserved ticket rows to the cart without using client prices", () => {
    const cart = checkoutCartFingerprint([mappedB, general, mappedA])
    const tickets = checkoutTicketRowsFingerprint([
      { tier_id: general.tierId },
      { tier_id: general.tierId },
      { tier_id: general.tierId },
      {
        tier_id: mappedA.tierId,
        seating_unit_id: mappedA.seatingUnitId,
      },
      {
        tier_id: mappedB.tierId,
        seating_unit_id: mappedB.seatingUnitId,
      },
    ])
    assert.equal(cart, tickets)
    assert.equal(cart.includes("10000"), false)
  })

  it("treats pending and paid as reusable, and a fresh claim as in progress", () => {
    assert.equal(isReusableCheckoutOrderStatus("pending"), true)
    assert.equal(isReusableCheckoutOrderStatus("paid"), true)
    assert.equal(isReusableCheckoutOrderStatus("expired"), false)
    const created = new Date(Date.now() - 5_000).toISOString()
    assert.equal(isCheckoutIdempotencyInProgress(created), true)
    const stale = new Date(
      Date.now() - CHECKOUT_IDEMPOTENCY_IN_PROGRESS_MS - 1,
    ).toISOString()
    assert.equal(isCheckoutIdempotencyInProgress(stale), false)
  })
})
