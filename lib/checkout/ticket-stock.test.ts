import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isTicketCardBlocked,
  isTicketSoldOut,
  selectableTicketStock,
} from "./ticket-stock"

describe("selectableTicketStock", () => {
  it("treats missing or invalid available as zero", () => {
    assert.equal(selectableTicketStock({}), 0)
    assert.equal(selectableTicketStock({ available: Number.NaN }), 0)
    assert.equal(isTicketSoldOut({ available: undefined }), true)
  })

  it("never lets the plus button exceed capacity minus sold", () => {
    assert.equal(
      selectableTicketStock({ available: 8, capacity: 10, sold: 10 }),
      0,
    )
    assert.equal(
      selectableTicketStock({ available: 4, capacity: 10, sold: 7 }),
      3,
    )
  })

  it("reads stock_available when available is missing", () => {
    assert.equal(selectableTicketStock({ stock_available: 6 }), 6)
    assert.equal(selectableTicketStock({ stockAvailable: 4 }), 4)
  })

  it("keeps live available when it is already tighter than capacity", () => {
    assert.equal(
      selectableTicketStock({ available: 2, capacity: 100, sold: 10 }),
      2,
    )
  })
})

describe("isTicketCardBlocked", () => {
  it("blocks inactive or zero-stock tickets including $0 SKUs", () => {
    assert.equal(isTicketCardBlocked({ available: 0, isActive: true }), true)
    assert.equal(isTicketCardBlocked({ available: 3, isActive: false }), true)
    assert.equal(isTicketCardBlocked({ available: 1, isActive: true }), false)
  })
})
